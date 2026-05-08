// utils/auditHelper.js
const AuditLog = require("../models/audit_log");
const { Sequelize } = require("sequelize");

/**
 * Registra una acción administrativa o cambio crítico en el log de auditoría.
 * 
 * @param {Object} params
 * @param {number} params.usuarioId - ID del usuario que ejecuta la acción (admin o sistema)
 * @param {string} params.accion - Código de la acción (ej: 'FORZAR_PAGO')
 * @param {string} params.entidadTipo - Nombre del modelo/tabla (ej: 'Adhesion')
 * @param {number} params.entidadId - ID del registro afectado
 * @param {Object|null} params.datosPrevios - Objeto con datos antes del cambio (opcional)
 * @param {Object|null} params.datosNuevos - Objeto con datos después del cambio (opcional)
 * @param {string|null} params.motivo - Razón de la acción (opcional)
 * @param {string|null} params.ip - IP del cliente (opcional)
 * @param {string|null} params.userAgent - User-Agent del cliente (opcional)
 * @param {import("sequelize").Transaction|null} params.transaccion - Transacción de Sequelize (opcional)
 * @returns {Promise<AuditLog>}
 */
async function registrarAuditoria({
  usuarioId,
  accion,
  entidadTipo,
  entidadId,
  datosPrevios = null,
  datosNuevos = null,
  motivo = null,
  ip = null,
  userAgent = null,
  transaccion = null,
}) {
  // Validación básica
  if (!usuarioId || !accion || !entidadTipo || !entidadId) {
    throw new Error("Faltan campos obligatorios para auditoría");
  }

  // Opcional: limpiar datos sensibles (contraseñas, tokens) antes de guardar
  const sanitizar = (obj) => {
    if (!obj) return null;
    const copia = { ...obj };
    const camposSensibles = ["contraseña_hash", "twofa_secret", "reset_password_token"];
    for (const campo of camposSensibles) {
      if (copia[campo]) copia[campo] = "***";
    }
    return copia;
  };

  return await AuditLog.create(
    {
      usuario_id: usuarioId,
      accion,
      entidad_tipo: entidadTipo,
      entidad_id: entidadId,
      datos_previos: sanitizar(datosPrevios),
      datos_nuevos: sanitizar(datosNuevos),
      motivo,
      ip_origen: ip,
      user_agent: userAgent,
    },
    { transaction: transaccion }
  );
}

module.exports = { registrarAuditoria };