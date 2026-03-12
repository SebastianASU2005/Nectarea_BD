// controllers/suscripcion.controller.js
const suscripcionService = require("../services/suscripcion.service");

const suscripcionController = {
  /**
   * Cancela lógicamente una suscripción por ID.
   */
  async cancel(req, res) {
    try {
      const { id } = req.params;
      const usuarioAutenticado = req.user;

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
      }

      const suscripcionCancelada = await suscripcionService.softDelete(
        id,
        usuarioAutenticado,
      );

      res.status(200).json({
        message: "Suscripción cancelada correctamente.",
        suscripcion: suscripcionCancelada,
      });
    } catch (error) {
      let statusCode = 500;
      if (
        error.message.includes("Acceso denegado") ||
        error.message.includes("No se puede cancelar") ||
        error.message.includes("ya ha sido cancelada")
      ) {
        statusCode = 403;
      } else if (error.message.includes("Suscripción no encontrada")) {
        statusCode = 404;
      } else if (
        error.message.includes("El ID del proyecto debe ser un número")
      ) {
        statusCode = 400;
      }
      res.status(statusCode).json({ error: error.message });
    }
  },

  /**
   * Marca la devolución de dinero para un registro de cancelación. (Solo Admin)
   */
  async marcarDevolucion(req, res) {
    try {
      const { id } = req.params;

      const registro = await suscripcionService.marcarDevolucion(id);

      res.status(200).json({
        success: true,
        mensaje: "Devolución registrada correctamente.",
        registro,
      });
    } catch (error) {
      const status = error.message.includes("no encontrado")
        ? 404
        : error.message.includes("ya fue registrada")
          ? 400
          : 500;
      res.status(status).json({ error: error.message });
    }
  },

  /**
   * Obtiene todas las suscripciones canceladas. (Solo Admin)
   */
  async findAllCanceladas(req, res) {
    try {
      const canceladas = await suscripcionService.findAllCanceladas();
      res.status(200).json(canceladas);
    } catch (error) {
      res
        .status(500)
        .json({
          error: "Error al obtener todas las suscripciones canceladas.",
          details: error.message,
        });
    }
  },

  /**
   * Obtiene las cancelaciones del usuario autenticado.
   */
  async findMyCanceladas(req, res) {
    try {
      const userId = req.user.id;
      const canceladas = await suscripcionService.findMyCanceladas(userId);
      res.status(200).json(canceladas);
    } catch (error) {
      res
        .status(500)
        .json({
          error: "Error al obtener las suscripciones canceladas del usuario.",
          details: error.message,
        });
    }
  },

  /**
   * Obtiene las cancelaciones de un proyecto específico. (Solo Admin)
   */
  async findByProjectCanceladas(req, res) {
    try {
      const projectId = req.params.id;

      if (isNaN(parseInt(projectId))) {
        return res
          .status(400)
          .json({ error: "El ID del proyecto debe ser un número." });
      }

      const canceladas =
        await suscripcionService.findByProjectCanceladas(projectId);
      res.status(200).json(canceladas);
    } catch (error) {
      res
        .status(500)
        .json({
          error: `Error al obtener las suscripciones canceladas para el proyecto ${req.params.id}.`,
          details: error.message,
        });
    }
  },
};

module.exports = suscripcionController;
