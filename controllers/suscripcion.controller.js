const suscripcionService = require("../services/suscripcion.service");

/**
 * Controlador de Express para manejar las peticiones HTTP relacionadas con las Suscripciones a Proyectos.
 * Actualmente maneja la cancelación (eliminación lógica) y consultas de cancelaciones.
 */
const suscripcionController = {
  /**
   * @async
   * @function cancel
   * @description Cancela lógicamente una suscripción por ID (soft delete).
   * La verificación de propiedad y la validación de la puja ganadora se manejan en el servicio.
   * @param {object} req - Objeto de solicitud de Express (ID de suscripción en `params` y ID de usuario en `req.user.id`).
   * @param {object} res - Objeto de respuesta de Express.
   */
  async cancel(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id; // Obtiene el ID del usuario autenticado.

      // 1. Realizar la eliminación lógica (soft delete).
      // Se pasa el userId para que el servicio valide la propiedad y la restricción de puja.
      const suscripcionCancelada = await suscripcionService.softDelete(
        id,
        userId
      );

      // 2. Respuesta de éxito.
      res.status(200).json({
        message: "Suscripción cancelada correctamente.",
        suscripcion: suscripcionCancelada,
      });
    } catch (error) {
      // Manejar errores lanzados por el servicio (no existe, no pertenece, puja ganadora, etc.).
      let statusCode = 400; // Bad Request por defecto

      if (
        error.message.includes("Acceso denegado") ||
        error.message.includes("No se puede cancelar")
      ) {
        statusCode = 403; // Forbidden
      } else if (error.message.includes("Suscripción no encontrada")) {
        statusCode = 404; // Not Found
      }

      res.status(statusCode).json({ error: error.message });
    }
  },

  /**
   * @async
   * @function findAllCanceladas
   * @description Obtiene un listado de todas las suscripciones canceladas. (Solo para Admin)
   * @param {object} req - Objeto de solicitud de Express.
   * @param {object} res - Objeto de respuesta de Express.
   */
  async findAllCanceladas(req, res) {
    try {
      const canceladas = await suscripcionService.findAllCanceladas();
      res.status(200).json(canceladas);
    } catch (error) {
      // Manejo genérico de errores de DB/Servicio.
      res.status(500).json({
        error: "Error al obtener todas las suscripciones canceladas.",
        details: error.message,
      });
    }
  },

  /**
   * @async
   * @function findMyCanceladas
   * @description Obtiene el listado de suscripciones canceladas para el usuario autenticado.
   * @param {object} req - Objeto de solicitud de Express (contiene el ID del usuario en `req.user.id`).
   * @param {object} res - Objeto de respuesta de Express.
   */
  async findMyCanceladas(req, res) {
    try {
      const userId = req.user.id;
      const canceladas = await suscripcionService.findMyCanceladas(userId);
      res.status(200).json(canceladas);
    } catch (error) {
      res.status(500).json({
        error: "Error al obtener las suscripciones canceladas del usuario.",
        details: error.message,
      });
    }
  },
  /**
   * @async
   * @function findByProjectCanceladas
   * @description Obtiene el listado de suscripciones canceladas para un ID de proyecto específico. (Solo para Admin)
   * @param {object} req - Objeto de solicitud de Express (contiene el ID del proyecto en `req.params.id`).
   * @param {object} res - Objeto de respuesta de Express.
   */
  async findByProjectCanceladas(req, res) {
    // 👈 ¡Añadir esta función!
    try {
      const projectId = req.params.id;

      // Validar que el ID es numérico para evitar el error que vimos antes.
      if (isNaN(parseInt(projectId))) {
        return res
          .status(400)
          .json({ error: "El ID del proyecto debe ser un número." });
      }

      const canceladas = await suscripcionService.findByProjectCanceladas(
        projectId
      );
      res.status(200).json(canceladas);
    } catch (error) {
      res.status(500).json({
        error: `Error al obtener las suscripciones canceladas para el proyecto ${req.params.id}.`,
        details: error.message,
      });
    }
  },
};

module.exports = suscripcionController;
