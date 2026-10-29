// Archivo: services/pasarela.registry.js
//
// ÚNICO punto del sistema que decide (a) en qué moneda se cobra una transacción
// y (b) con qué pasarela. Agregar una pasarela/moneda nueva = tocar solo este
// archivo + crear el servicio de la pasarela.
//
// Contrato que debe cumplir cada servicio de pasarela:
//   createPaymentSession(datos, transaccionId) -> { preferenceId, redirectUrl }
//   verifyAndFetchPayment(req, metodo)         -> { transaccionId, status, transactionId, paymentDetails, rawDetails } | null
//   realizarReembolso(paymentId, monto)        -> { success, alreadyRefunded?, pending?, manual?, message? }
//   refreshPaymentStatus(transaccionId, paymentId) -> { transaccion, pagoMercado } | null
// Miembros adicionales para pasarelas distintas de Mercado Pago: 
//   mapearEstado(statusRaw)                    -> enum de PagoMercado.estado
//   esWebhookAutorizado(req)                   -> Promise<boolean> (validación de origen del webhook)
//   requiereCapturaAlRetorno                   -> true si el cobro se confirma capturando al volver el usuario

const PASARELAS = Object.freeze({
  MERCADOPAGO: "mercadopago",
  PAYPAL: "paypal",
});

const MONEDAS = Object.freeze({ ARS: "ARS", USD: "USD" });

/**
 * Moneda en la que se cobra una transacción.
 * Solo las inversiones "directo" usan la moneda del proyecto; mensualidades,
 * adhesiones y pujas son SIEMPRE ARS (aunque proyecto.moneda diga otra cosa,
 * p. ej. el default "USD" del modelo Proyecto en datos legados).
 */
function resolverMoneda(tipoTransaccion, proyecto) {
  if (tipoTransaccion === "directo" && proyecto && proyecto.moneda) {
    const moneda = String(proyecto.moneda).toUpperCase();
    if (Object.values(MONEDAS).includes(moneda)) return moneda;
  }
  return MONEDAS.ARS;
}

/**
 * Pasarela que corresponde a (tipo, moneda). USD directo → PayPal; resto → Mercado Pago.
 */
function resolverPasarela(tipoTransaccion, moneda) {
  if (tipoTransaccion === "directo" && moneda === MONEDAS.USD) {
    return PASARELAS.PAYPAL;
  }
  return PASARELAS.MERCADOPAGO;
}

/**
 * Devuelve el servicio de la pasarela. Los require son perezosos para evitar
 * dependencias circulares (los servicios de pasarela requieren transaccion.service).
 */
function getGateway(metodo) {
  switch (metodo) {
    case PASARELAS.MERCADOPAGO:
      return require("./pagoMercado.service");
    case PASARELAS.PAYPAL:
      return require("./paypal.service");
    default:
      throw new Error(`Pasarela de pago no soportada: ${metodo}`);
  }
}

function esPasarelaSoportada(metodo) {
  return Object.values(PASARELAS).includes(metodo);
}

module.exports = {
  PASARELAS,
  MONEDAS,
  resolverMoneda,
  resolverPasarela,
  getGateway,
  esPasarelaSoportada,
};
