// Archivo: utils/jsonSanitizer.js
//
// 🔒 HARDENING — "json replacer" global de Express (app.set("json replacer", ...)).
//
// Se ejecuta SOLO al serializar respuestas JSON, en cualquier nivel de anidamiento
// (incluye modelos incluidos con `include`, p. ej. { model: Usuario, as: "usuario" }).
// No modifica la lógica de negocio ni lo que se guarda en la base de datos.
//
//  • Elimina campos secretos de la respuesta (hash de contraseña, secreto 2FA, tokens).
//  • Firma (con vencimiento) las URLs de archivos privados (KYC y contratos) para que
//    el front pueda seguir mostrándolas aunque /uploads/kyc y /uploads/contratos
//    ya no sean públicas.

const { isPrivateUploadPath, signUploadUrl } = require("./signedUrl");

const SENSITIVE_KEYS = new Set([
  "contraseña_hash",
  "twofa_secret",
  "reset_password_token",
  "confirmacion_token",
]);

function jsonReplacer(key, value) {
  if (SENSITIVE_KEYS.has(key)) return undefined;

  if (
    typeof value === "string" &&
    key.startsWith("url_") &&
    isPrivateUploadPath(value) &&
    !value.includes("?s=") &&
    !value.includes("&s=")
  ) {
    return signUploadUrl(value);
  }
  return value;
}

module.exports = { jsonReplacer, SENSITIVE_KEYS };
