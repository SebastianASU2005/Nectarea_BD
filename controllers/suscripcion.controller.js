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
   * Ahora pasa el objeto de usuario completo para la verificación de rol de administrador.
   */
  async cancel(req, res) {
    try {
      const { id } = req.params; // 🛑 CAMBIO CLAVE: Obtiene el objeto de usuario autenticado.
      const usuarioAutenticado = req.user; // Nueva validación: Asegura que el objeto de usuario esté disponible.

      if (
        !usuarioAutenticado ||
        !usuarioAutenticado.id ||
        !usuarioAutenticado.rol
      ) {
        return res
          .status(401)
          .json({
            error:
              "Usuario no autenticado o datos de autenticación incompletos.",
          });
      } // 1. Realizar la eliminación lógica (soft delete). // Se pasa el objeto completo (que incluye el rol) al servicio.

      const suscripcionCancelada = await suscripcionService.softDelete(
        id,
        usuarioAutenticado // 👈 ¡Se pasa el objeto completo!
      ); // 2. Respuesta de éxito.

      res.status(200).json({
        message: "Suscripción cancelada correctamente.",
        suscripcion: suscripcionCancelada,
      });
    } catch (error) {
      // Manejar errores lanzados por el servicio
      let statusCode = 500; // Por defecto

      if (
        error.message.includes("Acceso denegado") ||
        error.message.includes("No se puede cancelar") ||
        error.message.includes("ya ha sido cancelada")
      ) {
        statusCode = 403; // Forbidden / Bad Request
      } else if (error.message.includes("Suscripción no encontrada")) {
        statusCode = 404; // Not Found
      } else if (
        error.message.includes("El ID del proyecto debe ser un número")
      ) {
        statusCode = 400; // Bad Request
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
