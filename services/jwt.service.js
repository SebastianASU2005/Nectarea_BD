// Archivo: services/jwt.service.js
const jwt = require("jsonwebtoken");
require("dotenv").config();

// 🔒 HARDENING: algoritmo fijo (evita ataques de confusión de algoritmo, p. ej. "none")
const JWT_ALGORITHM = "HS256";

// 🔒 HARDENING: advertir (sin romper el arranque) si el secreto es débil
if (!process.env.JWT_SECRET) {
  console.error("❌ JWT_SECRET no está definido: no se podrán firmar/verificar tokens.");
} else if (process.env.JWT_SECRET.length < 32) {
  console.warn(
    "⚠️ JWT_SECRET tiene menos de 32 caracteres. Se recomienda un valor aleatorio de 64+ caracteres.",
  );
}

/**
 * Servicio para la generación y verificación de JSON Web Tokens (JWT).
 * Utiliza la clave secreta definida en las variables de entorno (JWT_SECRET).
 */
const jwtService = {
  /**
   * @function generateToken
   * @description Genera un token JWT estándar para la sesión de un usuario.
   * Contiene el ID, nombre de usuario y rol.
   * @param {object} user - Objeto usuario con id, nombre_usuario y rol.
   * @returns {string} El token JWT generado (expira en 1 hora).
   */
  generateToken(user) {
    const payload = {
      id: user.id,
      nombre_usuario: user.nombre_usuario,
      rol: user.rol,
      token_version: user.token_version,
    };
    // Token de sesión normal, puede durar más tiempo (ej: 1h)
    return jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: "1h",
      algorithm: JWT_ALGORITHM,
    });
  },

  /**
   * @function verifyToken
   * @description Verifica y decodifica un token JWT de sesión normal.
   * @param {string} token - El token JWT a verificar.
   * @returns {object|null} El payload decodificado si es válido, o null si falla la verificación.
   */
  verifyToken(token) {
    try {
      return jwt.verify(token, process.env.JWT_SECRET, {
        algorithms: [JWT_ALGORITHM],
      });
    } catch (error) {
      // Devuelve null si el token es inválido o ha expirado
      return null;
    }
  },

  /**
   * @function generate2FAToken
   * @description Genera un token de verificación de corta duración para la Autenticación de Dos Factores (2FA).
   * Solo incluye el ID del usuario en el payload.
   * @param {object} user - Objeto usuario con id.
   * @returns {string} El token JWT generado (expira en 5 minutos).
   */
  generate2FAToken(user) {
    const payload = {
      id: user.id,
      // 🔒 HARDENING: marca explícita para que este token nunca sea usado como sesión
      purpose: "2fa",
    };
    // Token de corta duración (ej: 5 minutos) para evitar ataques de repetición.
    return jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: "5m",
      algorithm: JWT_ALGORITHM,
    });
  },

  /**
   * @function verify2FAToken
   * @description Verifica y decodifica un token de verificación 2FA.
   * @param {string} token - El token 2FA a verificar.
   * @returns {object|null} El payload decodificado si es válido, o null si falla la verificación o ha expirado.
   */
  verify2FAToken(token) {
    try {
      // Usa la misma clave secreta (JWT_SECRET)
      const decoded = jwt.verify(token, process.env.JWT_SECRET, {
        algorithms: [JWT_ALGORITHM],
      });
      // 🔒 HARDENING: un token de SESIÓN (lleva 'rol') no puede usarse como token 2FA.
      // (Los tokens 2FA emitidos antes del despliegue, sin 'purpose', siguen siendo válidos.)
      if (decoded.rol !== undefined) return null;
      return decoded;
    } catch (error) {
      return null;
    }
  },
};

module.exports = jwtService;
