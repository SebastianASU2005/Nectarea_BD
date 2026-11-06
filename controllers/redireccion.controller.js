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
const { verifyPaymentReturn } = require("../utils/signedUrl");

// 🔒 HARDENING: el id de transacción debe ser un entero (evita rutas raras en la redirección)
const idValido = (id) => /^\d{1,12}$/.test(String(id));

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
    if (!idValido(transaccionId)) {
      return res.status(400).send("Solicitud inválida.");
    }
    // 🔒 HARDENING: solo se cancela si la URL trae la firma emitida al crear el pago.
    // Sin firma válida (p. ej. alguien probando ids) únicamente se redirige a la pantalla de fallo.
    if (verifyPaymentReturn(transaccionId, "fallo", req.params.sig)) {
      try {
        await transaccionService.cancelarTransaccionPorUsuario(transaccionId);
      } catch (error) {
        console.error(`Error en handleFailure: ${error.message}`);
      }
    } else {
      console.warn(
        `⚠️ /pago/fallo/${transaccionId} sin firma válida: no se cancela la transacción.`,
      );
    }
    res.redirect(buildReturnUrls(transaccionId).failure);
  },

  async handleSuccess(req, res) {
    const transaccionId = req.params.id;
    if (!idValido(transaccionId)) {
      return res.status(400).send("Solicitud inválida.");
    }
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
    if (!idValido(req.params.id)) {
      return res.status(400).send("Solicitud inválida.");
    }
    res.redirect(buildReturnUrls(req.params.id).pending);
  },
};

module.exports = redireccionController;
