// Archivo: services/jwt.service.js
const jwt = require("jsonwebtoken");
require("dotenv").config();

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
    };
    // Token de sesión normal, puede durar más tiempo (ej: 1h)
    return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "1h" });
  },

  /**
   * @function verifyToken
   * @description Verifica y decodifica un token JWT de sesión normal.
   * @param {string} token - El token JWT a verificar.
   * @returns {object|null} El payload decodificado si es válido, o null si falla la verificación.
   */
  verifyToken(token) {
    try {
      return jwt.verify(token, process.env.JWT_SECRET);
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
      // Solo el ID es suficiente para la verificación 2FA
    };
    // Token de corta duración (ej: 5 minutos) para evitar ataques de repetición.
    return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "5m" });
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
      return jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
      return null;
    }
  },
};

module.exports = jwtService;
