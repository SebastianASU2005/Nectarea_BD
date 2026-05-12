// services/audit.service.js
const { sequelize, Op } = require("../config/database");
const AuditLog = require("../models/audit_log");

/**
 * Servicio para la gestión de logs de auditoría.
 * Incluye funciones para registrar eventos, consultar y limpiar logs antiguos.
 */
const auditService = {
  /**
   * Registra una acción administrativa o cambio crítico en el log de auditoría.
   * @param {Object} params
   * @param {number} params.usuarioId - ID del usuario que ejecuta la acción
   * @param {string} params.accion - Código de la acción (ej. 'FORZAR_PAGO')
   * @param {string} params.entidadTipo - Nombre del modelo (ej. 'Adhesion')
   * @param {number} params.entidadId - ID del registro afectado
   * @param {Object|null} [params.datosPrevios] - Estado antes del cambio
   * @param {Object|null} [params.datosNuevos] - Estado después del cambio
   * @param {string|null} [params.motivo] - Razón de la acción
   * @param {string|null} [params.ip] - IP del cliente
   * @param {string|null} [params.userAgent] - User-Agent del cliente
   * @param {import("sequelize").Transaction|null} [params.transaccion] - Transacción de Sequelize
   * @returns {Promise<AuditLog>}
   */
  async registrar({
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
    // ✅ Validación detallada
    const faltantes = [];
    if (!usuarioId) faltantes.push("usuarioId");
    if (!accion) faltantes.push("accion");
    if (!entidadTipo) faltantes.push("entidadTipo");
    if (!entidadId) faltantes.push("entidadId");

    if (faltantes.length > 0) {
      throw new Error(
        `Faltan campos obligatorios para auditoría: ${faltantes.join(", ")}`,
      );
    }

    // Sanitizar datos sensibles
    const sanitizar = (obj) => {
      if (!obj) return null;
      const copia = { ...obj };
      const camposSensibles = [
        "contraseña_hash",
        "twofa_secret",
        "reset_password_token",
      ];
      for (const campo of camposSensibles) {
        if (copia[campo]) copia[campo] = "***";
      }
      return copia;
    };

    return AuditLog.create(
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
        created_at: new Date(),
      },
      { transaction: transaccion },
    );
  },

  /**
   * Obtiene logs con filtros opcionales (paginado).
   */
  async listar(filtros = {}, page = 1, limit = 50) {
    const where = {};
    if (filtros.usuarioId) where.usuario_id = filtros.usuarioId;
    if (filtros.accion) where.accion = filtros.accion;
    if (filtros.entidadTipo) where.entidad_tipo = filtros.entidadTipo;
    if (filtros.entidadId) where.entidad_id = filtros.entidadId;
    if (filtros.fechaDesde || filtros.fechaHasta) {
      where.created_at = {};
      if (filtros.fechaDesde) where.created_at[Op.gte] = filtros.fechaDesde;
      if (filtros.fechaHasta) where.created_at[Op.lte] = filtros.fechaHasta;
    }
    const offset = (page - 1) * limit;
    const { count, rows } = await AuditLog.findAndCountAll({
      where,
      order: [["created_at", "DESC"]],
      limit,
      offset,
    });
    return { rows, count };
  },

  /**
   * Obtiene todos los logs de una entidad específica.
   */
  async findByEntidad(entidadTipo, entidadId) {
    return AuditLog.findAll({
      where: { entidad_tipo: entidadTipo, entidad_id: entidadId },
      order: [["created_at", "DESC"]],
    });
  },

  /**
   * Elimina logs más antiguos que `dias` días.
   */
  async limpiarLogsAntiguos(dias = 365) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - dias);
    const deleted = await AuditLog.destroy({
      where: { created_at: { [Op.lt]: cutoffDate } },
    });
    console.log(
      `🧹 AuditLog: ${deleted} registros eliminados (anteriores a ${cutoffDate.toISOString()})`,
    );
    return deleted;
  },
};

module.exports = auditService;
