// Importar los modelos necesarios (se mantienen)
const SuscripcionProyecto = require("../models/suscripcion_proyecto");
const Proyecto = require("../models/proyecto");
const Pago = require("../models/pago");
const SuscripcionCancelada = require("../models/suscripcion_cancelada");
const { sequelize } = require("../config/database");

// 🆕 Importar el servicio principal que ahora contiene la lógica de cancelación
const suscripcionProyectoService = require("./suscripcion_proyecto.service");

/**
 * Servicio de lógica de negocio para la gestión de CancelacionDeSuscripciones a Proyectos.
 * Funciona como un "wrapper" para redirigir la lógica pesada al servicio principal.
 */
const suscripcionService = {
  /**
   * @async
   * @function findById
   */
  async findById(id) {
    return SuscripcionProyecto.findByPk(id);
  }
  /**
   * @async
   * @function findByUserIdAndProjectId
   */,

  async findByUserIdAndProjectId(userId, projectId) {
    return SuscripcionProyecto.findOne({
      where: {
        id_usuario: userId,
        id_proyecto: projectId,
        activo: true,
      },
    });
  }
  /**
   * @async
   * @function softDelete
   * @description **DELEGADO:** Llama al softDelete del servicio principal.
   * @param {number} suscripcionId - ID de la suscripción a cancelar.
   * @param {number} userId - ID del usuario. 🆕 PARÁMETRO AÑADIDO
   * @returns {Promise<SuscripcionProyecto>}
   * @throws {Error} Si la cancelación falla (incluida la validación de puja).
   */,

  async softDelete(suscripcionId, userId) {
    // 🆕 Se añade 'userId' para pasar al servicio principal.
    // 🛑 Delega la lógica de negocio al servicio consolidado.
    return suscripcionProyectoService.softDelete(suscripcionId, userId);
  }
  /**
   * @async
   * @function findAllCanceladas
   * @description **DELEGADO**
   */,
  async findAllCanceladas() {
    // 🛑 Delega la consulta al servicio consolidado.
    return suscripcionProyectoService.findAllCanceladas();
  }
  /**
   * @async
   * @function findMyCanceladas
   * @description **DELEGADO**
   */,
  async findMyCanceladas(userId) {
    // 🛑 Delega la consulta al servicio consolidado.
    return suscripcionProyectoService.findMyCanceladas(userId);
  },
  /**
     * @async
     * @function findByProjectCanceladas
     * @description **DELEGADO**
     */
    async findByProjectCanceladas(projectId) { // 👈 ¡Añadir esta función!
        // 🛑 Delega la consulta al servicio consolidado.
        return suscripcionProyectoService.findByProjectCanceladas(projectId);
    },

};

module.exports = suscripcionService;
