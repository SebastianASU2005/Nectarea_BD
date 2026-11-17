// Archivo: middlewares/rateLimiter.js

const rateLimit = require("express-rate-limit");
const {
  RateLimiterPostgres,
  RateLimiterMemory,
} = require("rate-limiter-flexible");
const { sequelize } = require("../config/database");

// ============================================================
// STORE EN POSTGRESQL
// La librería crea la tabla automáticamente.
// Si la DB falla, el insuranceLimiter (memoria) toma el control.
// ============================================================
function createDbLimiter(keyPrefix, points, duration) {
  return new Promise((resolve) => {
    const insuranceLimiter = new RateLimiterMemory({ points, duration });

    const limiter = new RateLimiterPostgres(
      {
        storeClient: sequelize,
        keyPrefix,
        points,
        duration,
        insuranceLimiter,
        tableName: `rate_limit_${keyPrefix}`,
      },
      (err) => {
        if (err) {
          console.warn(
            `[RateLimiter] ⚠️  DB no disponible para "${keyPrefix}". Usando memoria.`,
          );
          resolve(insuranceLimiter);
        } else {
          console.log(
            `[RateLimiter] ✅ Store DB listo: rate_limit_${keyPrefix}`,
          );
          resolve(limiter);
        }
      },
    );
  });
}

function getIp(req) {
  // Railway siempre setea x-real-ip de forma confiable (no falsificable)
  return (
    req.headers["x-real-ip"] || req.ip || req.socket?.remoteAddress || "unknown"
  );
}
function sendTooManyRequests(res, msBeforeNext, message) {
  const retryAfter = Math.ceil(msBeforeNext / 1000);
  res.set("Retry-After", retryAfter);
  res.set("X-RateLimit-Remaining", 0);
  return res.status(429).json({ success: false, error: message, retryAfter });
}

// ============================================================
// ⚡ PERFORMANCE — Store del rate limiter
//   memory   (por defecto): contadores en RAM. Cero consultas a la BD por request.
//   postgres (RATE_LIMIT_STORE=postgres): comportamiento anterior. Útil SOLO si corrés varias
//            instancias y necesitás contadores compartidos (cuesta 1 UPSERT por request y
//            compite con la lógica de negocio por el pool de conexiones).
// Los límites (100/min por IP y 300/min por usuario) son idénticos en ambos modos.
// ============================================================
const RATE_LIMIT_STORE = (process.env.RATE_LIMIT_STORE || "memory").toLowerCase();

function createLimiter(keyPrefix, points, duration) {
  if (RATE_LIMIT_STORE === "postgres") {
    return createDbLimiter(keyPrefix, points, duration);
  }
  return Promise.resolve(new RateLimiterMemory({ keyPrefix, points, duration }));
}

// ============================================================
// STORES — se inicializan al arrancar la app
// ============================================================
let globalLimiterStore = null;
let clienteLimiterStore = null;
// adminLimiterStore no existe: admins pasan sin límite de usuario

/**
 * Llamar en synchronizeDatabase() DESPUÉS de los .sync() de Sequelize.
 * Con RATE_LIMIT_STORE=postgres crea las tablas rate_limit_global_ip y rate_limit_cliente.
 */
async function initRateLimiters() {
  // Global: 100 req/min por IP (aplica a TODOS, autenticados o no)
  globalLimiterStore = await createLimiter("global_ip", 100, 60);

  // Por usuario cliente autenticado: 300 req/min por userId
  clienteLimiterStore = await createLimiter("cliente", 300, 60);

  console.log(`[RateLimiter] 🚀 Rate limiters iniciados (store: ${RATE_LIMIT_STORE}).`);
}

// ============================================================
// 1. 🌐 MIDDLEWARE GLOBAL POR IP
//    Aplica a TODOS los requests.
//    El webhook de MercadoPago queda excluido automáticamente.
// ============================================================
async function globalRateLimiter(req, res, next) {
  // Excluir el webhook — tráfico de servidores de MercadoPago, no usuarios
  if (req.path.startsWith("/api/payment/webhook")) return next();

  // Store todavía no inicializado (arranque muy rápido) — dejamos pasar
  if (!globalLimiterStore) return next();

  try {
    await globalLimiterStore.consume(getIp(req));
    next();
  } catch (rateLimiterRes) {
    if (rateLimiterRes instanceof Error) {
      // Error real de DB → fail-open para no bloquear usuarios legítimos
      console.error(
        "[RateLimiter] Error en globalRateLimiter:",
        rateLimiterRes.message,
      );
      return next();
    }
    sendTooManyRequests(
      res,
      rateLimiterRes.msBeforeNext,
      "Demasiadas peticiones. Intentá de nuevo en 1 minuto.",
    );
  }
}

// ============================================================
// 2. 👤 MIDDLEWARE POR USUARIO AUTENTICADO
//    Adaptado a tu modelo: rol es "admin" | "cliente"
//    El campo en tu modelo es `rol` (no `role`)
//    Montar DESPUÉS de authMiddleware.authenticate en los routers.
// ============================================================
async function userRateLimiter(req, res, next) {
  // Sin usuario autenticado → el globalRateLimiter ya lo cubre por IP
  if (!req.user?.id) return next();

  // ⚠️  Tu modelo usa `rol` (español), no `role`
  const rol = req.user.rol ?? "cliente";

  // Admins sin límite por usuario (el global de IP sí aplica igual)
  if (rol === "admin") return next();

  // Clientes: 300 req/min por userId
  if (!clienteLimiterStore) return next();

  try {
    await clienteLimiterStore.consume(`user_${req.user.id}`);
    next();
  } catch (rateLimiterRes) {
    if (rateLimiterRes instanceof Error) {
      console.error(
        "[RateLimiter] Error en userRateLimiter:",
        rateLimiterRes.message,
      );
      return next();
    }
    sendTooManyRequests(
      res,
      rateLimiterRes.msBeforeNext,
      "Límite de peticiones alcanzado para tu cuenta. Máximo 300 peticiones por minuto.",
    );
  }
}

// ============================================================
// 3. 🔐 LIMITADORES DE AUTH (sin cambios)
// ============================================================

/** Login y registro: 5 intentos en 5 min por IP */
const loginLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: "Demasiados intentos fallidos. Intentá de nuevo en 5 minutos.",
  },
  statusCode: 429,
});

/** 2FA y reset-password: 3 intentos en 1 min por IP */
const fa2Limiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: "Límite de verificación excedido. Intentá de nuevo en 1 minuto.",
  },
  statusCode: 429,
});

module.exports = {
  initRateLimiters,
  globalRateLimiter,
  userRateLimiter,
  loginLimiter,
  fa2Limiter,
};
