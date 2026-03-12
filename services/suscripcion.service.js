// services/suscripcion.service.js
const SuscripcionProyecto = require("../models/suscripcion_proyecto");
const suscripcionProyectoService = require("./suscripcion_proyecto.service");

/**
 * Servicio wrapper para gestión de Suscripciones.
 * Delega toda la lógica pesada al suscripcionProyectoService.
 */
const suscripcionService = {
  async findById(id) {
    return SuscripcionProyecto.findByPk(id);
  },

  async findByUserIdAndProjectId(userId, projectId) {
    return SuscripcionProyecto.findOne({
      where: { id_usuario: userId, id_proyecto: projectId, activo: true },
    });
  },

  /** DELEGADO: Cancela una suscripción */
  async softDelete(suscripcionId, usuarioAutenticado) {
    return suscripcionProyectoService.softDelete(
      suscripcionId,
      usuarioAutenticado,
    );
  },

  /** DELEGADO: Marca la devolución de dinero de una cancelación */
  async marcarDevolucion(cancelacionId) {
    return suscripcionProyectoService.marcarDevolucion(cancelacionId);
  },

  /** DELEGADO: Obtiene todas las cancelaciones */
  async findAllCanceladas() {
    return suscripcionProyectoService.findAllCanceladas();
  },

  /** DELEGADO: Obtiene las cancelaciones del usuario autenticado */
  async findMyCanceladas(userId) {
    return suscripcionProyectoService.findMyCanceladas(userId);
  },

  /** DELEGADO: Obtiene las cancelaciones de un proyecto específico */
  async findByProjectCanceladas(projectId) {
    return suscripcionProyectoService.findByProjectCanceladas(projectId);
  },
};

module.exports = suscripcionService;
