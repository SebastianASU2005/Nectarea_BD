// Archivo: controllers/redireccion.controller.js
//
// Rutas de retorno del BACKEND (routes/redireccion.routes.js). Las usa PayPal:
// el usuario vuelve acá, se captura/sincroniza el pago en el servidor y recién
// después se lo redirige a las pantallas /pago/* del FRONTEND, las mismas a las que
// vuelve Mercado Pago. La URL base del front se define en config/paymentUrls.js
// (variable de entorno PAYMENT_RETURN_BASE_URL).

const transaccionService = require("../services/transaccion.service");
const Transaccion = require("../models/transaccion");
const { buildReturnUrls } = require("../config/paymentUrls");

const ESTADOS_FALLIDOS = ["fallido", "reembolsado", "expirado"];

/**
 * Pantalla del frontend que corresponde al estado real de la transacción.
 * @param {number|string} transaccionId
 * @param {string} estado estado_transaccion
 * @returns {string}
 */
function urlSegunEstado(transaccionId, estado) {
  const urls = buildReturnUrls(transaccionId);
  if (estado === "pagado") return urls.success;
  if (ESTADOS_FALLIDOS.includes(estado)) return urls.failure;
  return urls.pending; // pendiente / en_proceso: PagoResult sigue consultando
}

const redireccionController = {
  async handleFailure(req, res) {
    const transaccionId = req.params.id;
    try {
      await transaccionService.cancelarTransaccionPorUsuario(transaccionId);
    } catch (error) {
      console.error(`Error en handleFailure: ${error.message}`);
    }
    res.redirect(buildReturnUrls(transaccionId).failure);
  },

  async handleSuccess(req, res) {
    const transaccionId = req.params.id;
    try {
      // Pasarelas que requieren captura (PayPal) confirman el cobro aquí, al volver
      // el usuario; para Mercado Pago no hace nada. Luego se lee el estado real.
      await transaccionService.sincronizarPagoAlRetorno(transaccionId);

      const transaccion = await Transaccion.findByPk(transaccionId);
      if (!transaccion) {
        return res.redirect(buildReturnUrls(transaccionId).failure);
      }

      // Redirige con el estado real (puede ser pendiente si el webhook aún no llegó)
      res.redirect(
        urlSegunEstado(transaccionId, transaccion.estado_transaccion),
      );
    } catch (error) {
      console.error(`Error en handleSuccess: ${error.message}`);
      // La pantalla "pendiente" vuelve a consultar y reintenta la sincronización
      res.redirect(buildReturnUrls(transaccionId).pending);
    }
  },

  async handlePending(req, res) {
    res.redirect(buildReturnUrls(req.params.id).pending);
  },
};

module.exports = redireccionController;
