const auditService = require("../services/audit.service");

/**
 * Obtiene logs con paginación y filtros.
 * Solo accesible por administradores.
 */
const getLogs = async (req, res) => {
  try {
    const {
      usuarioId,
      accion,
      entidadTipo,
      entidadId,
      fechaDesde,
      fechaHasta,
      page = 1,
      limit = 50,
    } = req.query;

    const filtros = {};
    if (usuarioId) filtros.usuarioId = parseInt(usuarioId);
    if (accion) filtros.accion = accion;
    if (entidadTipo) filtros.entidadTipo = entidadTipo;
    if (entidadId) filtros.entidadId = parseInt(entidadId);
    if (fechaDesde) filtros.fechaDesde = new Date(fechaDesde);
    if (fechaHasta) filtros.fechaHasta = new Date(fechaHasta);

    const result = await auditService.listar(
      filtros,
      parseInt(page),
      parseInt(limit),
    );

    res.status(200).json({
      success: true,
      data: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: result.count,
        totalPages: Math.ceil(result.count / limit),
      },
    });
  } catch (error) {
    console.error("Error al obtener logs:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Obtiene logs de una entidad específica (sin paginación, útil para auditoría detallada).
 */
const getLogsByEntidad = async (req, res) => {
  try {
    const { entidadTipo, entidadId } = req.params;
    const logs = await auditService.findByEntidad(
      entidadTipo,
      parseInt(entidadId),
    );
    res.status(200).json({ success: true, data: logs });
  } catch (error) {
    console.error("Error al obtener logs por entidad:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * (Opcional) Limpieza manual de logs antiguos (solo admin).
 */
const limpiarLogs = async (req, res) => {
  try {
    const { dias = 365 } = req.query;
    const eliminados = await auditService.limpiarLogsAntiguos(parseInt(dias));
    res.status(200).json({
      success: true,
      message: `Se eliminaron ${eliminados} registros anteriores a ${dias} días.`,
    });
  } catch (error) {
    console.error("Error al limpiar logs:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { getLogs, getLogsByEntidad, limpiarLogs };
