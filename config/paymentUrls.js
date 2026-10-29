// Archivo: config/paymentUrls.js
//
// ÚNICO lugar donde se define a qué URL vuelve el usuario después de pagar
// (Mercado Pago y PayPal usan el mismo destino: las pantallas /pago/* del FRONTEND).
//
// Cuando el frontend esté desplegado, alcanza con definir en el entorno:
//   PAYMENT_RETURN_BASE_URL=https://tu-frontend.com
// Mientras no esté definida se mantiene el valor histórico (túnel ngrok del frontend).

const DEFAULT_RETURN_BASE_URL =
  "https://nonpresumptively-blamable-jarvis.ngrok-free.dev";

const RETURN_BASE_URL = (
  process.env.PAYMENT_RETURN_BASE_URL || DEFAULT_RETURN_BASE_URL
)
  .trim()
  .replace(/\/+$/, "");

/**
 * URLs de retorno al frontend para una transacción.
 * @param {number|string} transaccionId
 * @returns {{success: string, failure: string, pending: string}}
 */
function buildReturnUrls(transaccionId) {
  return {
    success: `https://nonpresumptively-blamable-jarvis.ngrok-free.dev/pago/exito//pago/exito/${transaccionId}`,
    failure: `https://nonpresumptively-blamable-jarvis.ngrok-free.dev/pago/exito//pago/fallo/${transaccionId}`,
    pending: `https://nonpresumptively-blamable-jarvis.ngrok-free.dev/pago/exito//pago/pendiente/${transaccionId}`,
  };
}

module.exports = { buildReturnUrls, RETURN_BASE_URL };