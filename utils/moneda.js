// Archivo: utils/moneda.js
// Utilidades de presentación de montos según moneda.

const SIMBOLOS = Object.freeze({ ARS: "$", USD: "US$" });

/**
 * Formatea un monto con el símbolo de su moneda. Ej.: (1500, "USD") → "US$1500.00"
 * @param {number|string} monto
 * @param {"ARS"|"USD"} [moneda="ARS"]
 * @returns {string}
 */
function formatearMonto(monto, moneda = "ARS") {
  const simbolo = SIMBOLOS[moneda] || "$";
  return `${simbolo}${Number(monto).toFixed(2)}`;
}

module.exports = { formatearMonto, SIMBOLOS };