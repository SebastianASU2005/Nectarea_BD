// Archivo: controllers/redireccion.controller.js (CREAR ESTE ARCHIVO)
const transaccionService = require("../services/transaccion.service");
// Asegúrate de definir esta variable de entorno en .env o usar el fallback
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:8080"; 

const redireccionController = {
  /**
   * Maneja el retorno de fallo/cancelación desde Mercado Pago.
   * La lógica de negocio la marcamos como 'fallido' para reflejar la cancelación.
   */
  async handleFailure(req, res) {
    const transaccionId = req.params.id;
    try {
      // 🎯 Llama al servicio para actualizar la Transacción a 'fallido'
      await transaccionService.cancelarTransaccionPorUsuario(transaccionId);

      // 1. Redirige al frontend con el estado 'failure'
      res.redirect(`${FRONTEND_URL}/payment-result/${transaccionId}?status=failure&message=Operación%20cancelada`);
    } catch (error) {
      console.error(`Error en handleFailure para Transacción ${transaccionId}:`, error.message);
      // En caso de error, igual redirigimos, pero quizás con un mensaje de error genérico.
      res.redirect(`${FRONTEND_URL}/payment-result/${transaccionId}?status=error&message=Error%20interno`);
    }
  },

  // Otras funciones (debes crearlas si no existen)

  async handleSuccess(req, res) {
    const transaccionId = req.params.id;
    // NOTA: El webhook ya debería haber marcado esto como 'pagado'. Solo redirigimos.
    res.redirect(`${FRONTEND_URL}/payment-result/${transaccionId}?status=success`);
  },

  async handlePending(req, res) {
    const transaccionId = req.params.id;
    res.redirect(`${FRONTEND_URL}/payment-result/${transaccionId}?status=pending`);
  },
};

module.exports = redireccionController;