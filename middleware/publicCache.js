// Archivo: middleware/publicCache.js
//
// ⚡ PERFORMANCE — Micro-caché para los GET PÚBLICOS más pedidos (catálogo de proyectos/lotes).
//
// Problema: `/api/proyectos/activos/ahorristas` es público y arma proyecto → lotes → imágenes
// con MBs de JSON en cada visita. N visitantes simultáneos = N veces la misma consulta pesada.
//
// Qué hace:
//  - Solo cachea GET anónimos (SIN header Authorization) de rutas de una lista blanca.
//  - TTL corto (PUBLIC_CACHE_TTL_MS, por defecto 10 s; 0 = desactivado).
//  - Single-flight: si 500 visitantes piden lo mismo a la vez, la BD recibe UNA sola consulta.
//  - ETag + If-None-Match → 304 sin cuerpo para clientes que repiten la petición.
//  - Sirve gzip precomprimido (se comprime UNA vez por entrada, no una vez por request).
//  - Invalidación inmediata: cualquier POST/PUT/PATCH/DELETE bajo /api exitoso vacía la caché.
//  - Memoria acotada (PUBLIC_CACHE_MAX_MB, por defecto 64 MB; máx. 300 entradas).
//
// Trade-off: los cambios hechos por tareas programadas (cron) o por otra instancia pueden verse
// con hasta TTL segundos de retraso. Los hechos vía la API de esta instancia se ven al instante.

const crypto = require("crypto");
const zlib = require("zlib");

const parsedTtl = parseInt(process.env.PUBLIC_CACHE_TTL_MS, 10);
const TTL_MS = Number.isFinite(parsedTtl) && parsedTtl >= 0 ? parsedTtl : 10000;
const MAX_BYTES = (parseInt(process.env.PUBLIC_CACHE_MAX_MB, 10) || 64) * 1024 * 1024;
const MAX_ENTRIES = 300;
const FLIGHT_TIMEOUT_MS = 30000;

// Solo estas rutas (todas públicas, sin dependencia del usuario).
const CACHEABLE = [
  /^\/api\/proyectos\/activos\/(ahorristas|inversionistas)$/,
  /^\/api\/proyectos\/search\/by-budget$/,
  /^\/api\/proyectos\/\d+\/activo$/,
  /^\/api\/lotes\/\d+\/activo$/,
];

const store = new Map(); // key -> entry
const inflight = new Map(); // key -> Promise<entry>
let totalBytes = 0;
let generation = 0; // se incrementa al invalidar: evita guardar resultados "viejos" de una consulta en vuelo

const stats = { hit: 0, miss: 0, coalesced: 0, notModified: 0, invalidations: 0 };

function drop(key) {
  const e = store.get(key);
  if (e) {
    totalBytes -= e.size;
    store.delete(key);
  }
}

function clearAll() {
  store.clear();
  totalBytes = 0;
  generation++;
  stats.invalidations++;
}

function save(key, entry) {
  if (entry.size > MAX_BYTES / 2) return; // una sola entrada no puede ocupar media caché
  drop(key);
  while ((totalBytes + entry.size > MAX_BYTES || store.size >= MAX_ENTRIES) && store.size > 0) {
    drop(store.keys().next().value); // la más antigua
  }
  store.set(key, entry);
  totalBytes += entry.size;
}

function gzipOf(entry) {
  if (!entry.gzipPromise) {
    entry.gzipPromise = new Promise((resolve, reject) =>
      zlib.gzip(entry.body, { level: 6 }, (err, buf) => (err ? reject(err) : resolve(buf))),
    ).then((buf) => {
      entry.gzip = buf;
      return buf;
    });
  }
  return entry.gzipPromise;
}

async function serve(req, res, entry, cacheState) {
  res.setHeader("X-Cache", cacheState);
  res.setHeader("ETag", entry.etag);
  res.setHeader("Vary", "Accept-Encoding");
  res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");

  if (req.headers["if-none-match"] === entry.etag) {
    stats.notModified++;
    return res.status(304).end();
  }

  res.status(entry.status);
  res.setHeader("Content-Type", entry.contentType);
  const acceptsGzip = /\bgzip\b/.test(req.headers["accept-encoding"] || "");
  if (acceptsGzip && entry.body.length > 1024) {
    try {
      const gz = entry.gzip || (await gzipOf(entry));
      res.setHeader("Content-Encoding", "gzip");
      res.setHeader("Content-Length", gz.length);
      return res.end(gz);
    } catch (_) {
      /* si falla la compresión se sirve sin comprimir */
    }
  }
  res.setHeader("Content-Length", entry.body.length);
  return res.end(entry.body);
}

function publicCache(req, res, next) {
  const method = req.method;

  // Invalidación: cualquier escritura exitosa vacía la caché (incluye webhooks de pago).
  if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
    res.on("finish", () => {
      if (res.statusCode < 400) clearAll();
    });
    return next();
  }

  if (TTL_MS === 0 || method !== "GET") return next();
  if (req.headers.authorization) return next(); // solo anónimos
  // Montado con app.use("/api", ...) → req.path es relativo; se reconstruye la ruta completa.
  const fullPath = req.baseUrl + req.path;
  if (!CACHEABLE.some((re) => re.test(fullPath))) return next();

  const key = req.originalUrl;
  const hit = store.get(key);
  if (hit && hit.expires > Date.now()) {
    stats.hit++;
    return serve(req, res, hit, "HIT").catch(next);
  }
  if (hit) drop(key);

  // Single-flight: ya hay alguien calculando esta misma URL → esperar su resultado.
  if (inflight.has(key)) {
    stats.coalesced++;
    let timer;
    const timeout = new Promise((resolve) => {
      timer = setTimeout(() => resolve(null), FLIGHT_TIMEOUT_MS);
    });
    return Promise.race([inflight.get(key), timeout])
      .then((entry) => {
        clearTimeout(timer);
        if (!entry) return next(); // el líder tardó demasiado: procesar normalmente
        return serve(req, res, entry, "COALESCED");
      })
      .catch(next);
  }

  // Este request es el "líder": ejecuta el handler real y captura su respuesta.
  stats.miss++;
  let settle;
  const flight = new Promise((resolve) => (settle = resolve));
  inflight.set(key, flight);
  const genAtStart = generation;

  const originalSend = res.send.bind(res);
  res.send = function patchedSend(body) {
    res.send = originalSend; // una sola vez
    try {
      const status = res.statusCode;
      const isBuf = Buffer.isBuffer(body);
      if (typeof body === "string" || isBuf) {
        const buf = isBuf ? body : Buffer.from(body, "utf8");
        const entry = {
          status,
          contentType: res.getHeader("Content-Type") || "application/json; charset=utf-8",
          body: buf,
          size: buf.length,
          etag: `W/"${crypto.createHash("sha1").update(buf).digest("base64")}"`,
          expires: Date.now() + TTL_MS,
        };
        // Solo se GUARDAN respuestas 200 y si no hubo una escritura mientras se calculaba.
        if (status === 200 && genAtStart === generation) save(key, entry);
        inflight.delete(key);
        settle(entry);
      } else {
        inflight.delete(key);
        settle(null);
      }
    } catch (_) {
      inflight.delete(key);
      settle(null);
    }
    return originalSend(body);
  };
  // Si la conexión del líder se cierra sin respuesta, liberar a los que esperan.
  res.on("close", () => {
    if (inflight.get(key) === flight) {
      inflight.delete(key);
      settle(null);
    }
  });

  res.setHeader("X-Cache", "MISS");
  return next();
}

publicCache.stats = () => ({ ...stats, entries: store.size, bytes: totalBytes, inflight: inflight.size });
publicCache.clear = clearAll;

module.exports = publicCache;
