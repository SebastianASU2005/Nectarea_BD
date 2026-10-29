// Archivo: config/paymentUrls.js
//
// ÚNICO lugar donde se define a qué URL vuelve el usuario después de pagar.
//
//  • Mercado Pago  → buildReturnUrls(): pantallas /pago/* del FRONTEND.
//    Mientras el frontend no esté desplegado apunta al túnel ngrok histórico
//    (no lleva a ningún lado y no importa: MP confirma el pago por webhook).
//    Al desplegar el front, definir en el entorno:
//        PAYMENT_RETURN_BASE_URL=https://tu-frontend.com
//
//  • PayPal        → buildServerReturnUrls(): rutas /pago/* del BACKEND (HOST_URL).
//    PayPal solo "aprueba" la orden; el cobro ocurre al CAPTURARla. Esa ruta del
//    backend captura el pago y recién después redirige al frontend. Así el cobro
//    funciona aunque el frontend todavía no esté desplegado.

const DEFAULT_RETURN_BASE_URL =
  "https://nonpresumptively-blamable-jarvis.ngrok-free.dev";

const sinBarraFinal = (url) => String(url).trim().replace(/\/+$/, "");

const RETURN_BASE_URL = sinBarraFinal(
  process.env.PAYMENT_RETURN_BASE_URL || DEFAULT_RETURN_BASE_URL,
);

const HOST_URL = sinBarraFinal(process.env.HOST_URL || "http://localhost:3000");

/**
 * URLs de retorno al FRONTEND (Mercado Pago).
 * @param {number|string} transaccionId
 * @returns {{success: string, failure: string, pending: string}}
 */
function buildReturnUrls(transaccionId) {
  return {
    success: `${RETURN_BASE_URL}/pago/exito/${transaccionId}`,
    failure: `${RETURN_BASE_URL}/pago/fallo/${transaccionId}`,
    pending: `${RETURN_BASE_URL}/pago/pendiente/${transaccionId}`,
  };
}

/**
 * URLs de retorno al BACKEND (PayPal): capturan el pago y luego redirigen al front
 * (routes/redireccion.routes.js → controllers/redireccion.controller.js).
 * @param {number|string} transaccionId
 * @returns {{success: string, failure: string}}
 */
function buildServerReturnUrls(transaccionId) {
  return {
    success: `${HOST_URL}/pago/exito/${transaccionId}`,
    failure: `${HOST_URL}/pago/fallo/${transaccionId}`,
  };
}

module.exports = { buildReturnUrls, buildServerReturnUrls, RETURN_BASE_URL };