// Archivo: utils/userCache.js
//
// ⚡ PERFORMANCE — Caché corta de usuarios para el middleware de autenticación.
//
// Problema: `authenticate` hacía 1 SELECT a `usuario` por CADA request autenticado
// (y `authorizeAdmin` repetía otro idéntico). Bajo carga, eso satura el pool de conexiones
// antes de ejecutar una sola línea de lógica de negocio.
//
// Solución:
//  - TTL corto (por defecto 5 s; AUTH_USER_CACHE_TTL_MS=0 lo desactiva).
//  - Single-flight: N requests simultáneos del mismo usuario comparten UNA consulta.
//  - Invalidación inmediata: cualquier save/update/destroy de un Usuario (login que incrementa
//    token_version, desactivación, cambio de rol, etc.) borra su entrada al instante.
//  - Acotada en tamaño (MAX_ENTRIES) → sin fugas de memoria.
//
// Seguridad: con UNA instancia de la app la invalidación es inmediata. Con varias instancias,
// el peor caso es que otra instancia tarde hasta TTL (5 s) en ver un cierre de sesión.

const Usuario = require("../models/usuario");

const parsed = parseInt(process.env.AUTH_USER_CACHE_TTL_MS, 10);
const TTL_MS = Number.isFinite(parsed) && parsed >= 0 ? parsed : 5000;
const MAX_ENTRIES = 5000;

const cache = new Map(); // id -> { user, expires }
const inflight = new Map(); // id -> Promise<Usuario|null>

function invalidate(id) {
  if (id === undefined || id === null) return;
  cache.delete(Number(id));
  cache.delete(String(id));
}

function clear() {
  cache.clear();
}

// Invalida ahora y, si el cambio ocurre dentro de una transacción, también DESPUÉS del COMMIT
// (entre el UPDATE y el COMMIT otra request podría re-cachear el valor viejo).
function invalidateAfterWrite(usuario, options) {
  invalidate(usuario && usuario.id);
  const t = options && options.transaction;
  if (t && typeof t.afterCommit === "function") {
    t.afterCommit(() => invalidate(usuario && usuario.id));
  }
}

// Hooks: se registran UNA vez al cargar el módulo.
Usuario.addHook("afterSave", "userCache:afterSave", invalidateAfterWrite);
Usuario.addHook("afterDestroy", "userCache:afterDestroy", invalidateAfterWrite);
// Operaciones masivas (Usuario.update({...}, { where })) no exponen los ids → se vacía la caché.
Usuario.addHook("afterBulkUpdate", "userCache:afterBulkUpdate", (options) => {
  clear();
  const t = options && options.transaction;
  if (t && typeof t.afterCommit === "function") t.afterCommit(clear);
});
Usuario.addHook("afterBulkDestroy", "userCache:afterBulkDestroy", (options) => {
  clear();
  const t = options && options.transaction;
  if (t && typeof t.afterCommit === "function") t.afterCommit(clear);
});

/**
 * Equivalente a `Usuario.findByPk(id)` pero con caché. Devuelve la instancia de Sequelize o null.
 * La instancia devuelta es COMPARTIDA: tratarla como de solo lectura.
 */
async function getById(id) {
  if (TTL_MS === 0) return Usuario.findByPk(id);

  const key = String(id);
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.user;

  if (inflight.has(key)) return inflight.get(key);

  const promise = Usuario.findByPk(id)
    .then((user) => {
      if (user) {
        if (cache.size >= MAX_ENTRIES) {
          // Expulsa la entrada más antigua (Map conserva el orden de inserción).
          cache.delete(cache.keys().next().value);
        }
        cache.set(key, { user, expires: Date.now() + TTL_MS });
      }
      return user;
    })
    .finally(() => inflight.delete(key));

  inflight.set(key, promise);
  return promise;
}

module.exports = { getById, invalidate, clear, TTL_MS };
