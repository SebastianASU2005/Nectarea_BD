// Archivo: middleware/privateUploads.js
//
// 🔒 HARDENING — Protege /uploads/kyc y /uploads/contratos (documentos de identidad,
// selfies, videos y contratos firmados). Antes cualquiera con la URL podía descargarlos.
//
// Acceso permitido si:
//   a) la URL trae una firma válida y no vencida (?e=...&s=...). La API las genera
//      automáticamente en los campos url_* (ver utils/jsonSanitizer.js), o
//   b) la petición trae un JWT de sesión válido de un ADMIN.
//
// Todo lo demás en /uploads (p. ej. /uploads/imagenes) sigue siendo público.

const path = require("path");
const jwtService = require("../services/jwt.service");
const usuarioService = require("../services/usuario.service");
const {
  normalizeUploadPath,
  isPrivateUploadPath,
  verifyUploadSignature,
} = require("../utils/signedUrl");

async function privateUploadsGuard(req, res, next) {
  let decoded;
  try {
    decoded = decodeURIComponent(req.path);
  } catch {
    return res.status(400).end();
  }

  const clean = path.posix.normalize(normalizeUploadPath(decoded));
  if (clean.startsWith("..") || clean.includes("\0")) {
    return res.status(400).end();
  }

  // Rutas públicas (imagenes, etc.)
  if (!isPrivateUploadPath(clean)) return next();

  // a) URL firmada
  if (req.query.e && req.query.s && verifyUploadSignature(clean, req.query.e, req.query.s)) {
    res.setHeader("Cache-Control", "private, no-store");
    return next();
  }

  // b) JWT de administrador
  try {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];
    const payload = token && jwtService.verifyToken(token);
    if (payload && payload.rol && payload.purpose !== "2fa") {
      const usuario = await usuarioService.findById(payload.id);
      if (
        usuario &&
        usuario.activo &&
        usuario.rol === "admin" &&
        usuario.token_version === (payload.token_version ?? 0)
      ) {
        res.setHeader("Cache-Control", "private, no-store");
        return next();
      }
    }
  } catch (_) {
    /* cae al 401 */
  }

  return res.status(401).json({ error: "Acceso no autorizado a este archivo." });
}

module.exports = privateUploadsGuard;
