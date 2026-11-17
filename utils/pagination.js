// Archivo: utils/pagination.js
//
// ⚡ PERFORMANCE — Paginación OPT-IN para endpoints de listado.
//
// Si la petición NO trae ?limit=, el comportamiento es EXACTAMENTE el de antes
// (devuelve todo) → no rompe al frontend actual.
// Si trae ?limit=N, se aplica LIMIT/OFFSET en la consulta SQL (no en memoria):
//
//   GET /api/transacciones?limit=50            -> primeras 50
//   GET /api/transacciones?limit=50&page=3     -> filas 101-150
//   GET /api/transacciones?limit=50&offset=20  -> a partir de la fila 21
//
// El cuerpo de la respuesta sigue siendo un array (mismo contrato). Para saber si hay
// más páginas: si la respuesta trae exactamente `limit` elementos, pedir la siguiente.

const MAX_LIMIT = Math.max(1, parseInt(process.env.PAGINATION_MAX_LIMIT, 10) || 200);

/**
 * Lee ?limit, ?page y ?offset de la query. Devuelve {} si no se pidió paginación.
 * @param {import('express').Request} req
 * @returns {{limit?: number, offset?: number}}
 */
function getPagination(req) {
  const q = (req && req.query) || {};
  if (q.limit === undefined || q.limit === "") return {};

  let limit = parseInt(q.limit, 10);
  if (!Number.isFinite(limit) || limit < 1) return {};
  limit = Math.min(limit, MAX_LIMIT);

  let offset = 0;
  if (q.offset !== undefined) {
    const o = parseInt(q.offset, 10);
    offset = Number.isFinite(o) && o > 0 ? o : 0;
  } else if (q.page !== undefined) {
    const p = parseInt(q.page, 10);
    offset = (Number.isFinite(p) && p > 1 ? p - 1 : 0) * limit;
  }
  return { limit, offset };
}

/**
 * Convierte lo anterior en opciones de Sequelize. Se pone PRIMERO en el objeto de opciones
 * (`{ ...paginationOptions(opts), where, include }`) para que un `order` propio de la
 * consulta tenga prioridad; si no hay, se usa id ASC (orden estable entre páginas).
 */
function paginationOptions(opts) {
  if (!opts || !opts.limit) return {};
  return { limit: opts.limit, offset: opts.offset || 0, order: [["id", "ASC"]] };
}

module.exports = { getPagination, paginationOptions, MAX_LIMIT };
