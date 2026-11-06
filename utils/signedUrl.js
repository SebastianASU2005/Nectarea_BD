// Archivo: utils/signedUrl.js
//
// 🔒 HARDENING — Firmas HMAC para:
//   1) URLs temporales de archivos privados (/uploads/kyc, /uploads/contratos)
//   2) URLs de retorno del backend para pasarelas de pago (/pago/fallo/:id/:sig)
//
// La clave se deriva de URL_SIGNING_SECRET (opcional) o, si no existe, de JWT_SECRET,
// por lo que NO requiere nuevas variables de entorno para funcionar.

const crypto = require("crypto");

const DEFAULT_TTL_SECONDS = parseInt(
  process.env.UPLOADS_URL_TTL_SECONDS || "1800",
  10,
); // 30 minutos

function getKey() {
  const base = process.env.URL_SIGNING_SECRET || process.env.JWT_SECRET;
  if (!base) return null;
  return crypto
    .createHmac("sha256", base)
    .update("nectarea:url-signing:v1")
    .digest();
}

function hmacHex(message) {
  const key = getKey();
  if (!key) return null;
  return crypto.createHmac("sha256", key).update(message).digest("hex");
}

function safeEqualHex(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

// ---------------------------------------------------------------------------
// 1) Archivos privados
// ---------------------------------------------------------------------------

/** Normaliza una ruta de upload a la forma "kyc/5/archivo.jpg" (sin "/" ni "uploads/"). */
function normalizeUploadPath(p) {
  let clean = String(p || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/^uploads\//, "");
  return clean;
}

/** Subcarpetas de /uploads que NO son públicas. */
const PRIVATE_UPLOAD_PREFIXES = ["kyc/", "contratos/"];

function isPrivateUploadPath(p) {
  const clean = normalizeUploadPath(p);
  return PRIVATE_UPLOAD_PREFIXES.some((prefix) => clean.startsWith(prefix));
}

/**
 * Devuelve la misma URL/ruta con ?e=<expira>&s=<firma> agregado.
 * Si no hay clave configurada devuelve el valor sin modificar.
 */
function signUploadUrl(value, ttlSeconds = DEFAULT_TTL_SECONDS) {
  if (!getKey()) return value;
  const clean = normalizeUploadPath(value);
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const sig = hmacHex(`upload:${clean}:${exp}`);
  const sep = String(value).includes("?") ? "&" : "?";
  return `${value}${sep}e=${exp}&s=${sig}`;
}

function verifyUploadSignature(cleanPath, exp, sig) {
  const expNum = parseInt(exp, 10);
  if (!Number.isFinite(expNum) || expNum < Math.floor(Date.now() / 1000)) {
    return false;
  }
  const expected = hmacHex(`upload:${normalizeUploadPath(cleanPath)}:${expNum}`);
  return expected !== null && safeEqualHex(expected, String(sig || ""));
}

// ---------------------------------------------------------------------------
// 2) Retornos de pasarela (PayPal) al backend
// ---------------------------------------------------------------------------

function signPaymentReturn(transaccionId, action) {
  const sig = hmacHex(`pay-return:${action}:${String(transaccionId)}`);
  return sig ? sig.slice(0, 32) : null;
}

function verifyPaymentReturn(transaccionId, action, sig) {
  const expected = signPaymentReturn(transaccionId, action);
  return expected !== null && safeEqualHex(expected, String(sig || ""));
}

module.exports = {
  normalizeUploadPath,
  isPrivateUploadPath,
  signUploadUrl,
  verifyUploadSignature,
  signPaymentReturn,
  verifyPaymentReturn,
  safeEqualHex,
};
