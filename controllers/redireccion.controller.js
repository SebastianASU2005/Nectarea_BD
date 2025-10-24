// Archivo: controllers/redireccion.controller.js

const transaccionService = require("../services/transaccion.service");
// Asegúrate de definir esta variable de entorno en .env o usar el fallback
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:8080";

/**
 * Controlador de Express dedicado a manejar las redirecciones de vuelta desde la
 * pasarela de pago (ej. Mercado Pago). No ejecuta la lógica crítica de negocio (eso es trabajo
 * del Webhook), solo actualiza el estado si es una cancelación/fallo y redirige al frontend.
 */
const redireccionController = {
  /**
   * @async
   * @function handleFailure
   * @description Maneja el retorno de fallo o cancelación desde la pasarela de pago.
   * Marca la transacción como 'fallida' en la DB y redirige al frontend.
   * @param {object} req - Objeto de solicitud de Express (contiene el ID de la transacción en `params`).
   * @param {object} res - Objeto de respuesta de Express.
   */
  async handleFailure(req, res) {
    const transaccionId = req.params.id;
    try {
      // 🎯 Llama al servicio para actualizar la Transacción a 'fallido' o 'cancelada'
      await transaccionService.cancelarTransaccionPorUsuario(transaccionId);

      // 1. Redirige al frontend con el estado 'failure'
      res.redirect(
        `${FRONTEND_URL}/payment-result/${transaccionId}?status=failure&message=Operación%20cancelada`
      );
    } catch (error) {
      console.error(
        `Error en handleFailure para Transacción ${transaccionId}:`,
        error.message
      );
      // En caso de error interno (ej. fallo al actualizar la DB), redirigir con un estado de error
      res.redirect(
        `${FRONTEND_URL}/payment-result/${transaccionId}?status=error&message=Error%20interno`
      );
    }
  },

  /**
   * @async
   * @function handleSuccess
   * @description Maneja la redirección de éxito desde la pasarela de pago.
   * **NOTA:** La confirmación final y la actualización de la DB se esperan del Webhook.
   * Esta función solo redirige al frontend para mostrar el resultado.
   * @param {object} req - Objeto de solicitud de Express (contiene el ID de la transacción en `params`).
   * @param {object} res - Objeto de respuesta de Express.
   */
  async handleSuccess(req, res) {
    const transaccionId = req.params.id;
    // Redirige al frontend con el estado 'success'
    res.redirect(
      `${FRONTEND_URL}/payment-result/${transaccionId}?status=success`
    );
  },

  /**
   * @async
   * @function handlePending
   * @description Maneja la redirección de estado pendiente desde la pasarela de pago.
   * Esta función solo redirige al frontend para informar sobre el estado.
   * @param {object} req - Objeto de solicitud de Express (contiene el ID de la transacción en `params`).
   * @param {object} res - Objeto de respuesta de Express.
   */
  async handlePending(req, res) {
    const transaccionId = req.params.id;
    // Redirige al frontend con el estado 'pending'
    res.redirect(
      `${FRONTEND_URL}/payment-result/${transaccionId}?status=pending`
    );
  },
};

module.exports = redireccionController;
