// Archivo: services/jwt.service.js
const jwt = require("jsonwebtoken");
require("dotenv").config();

const jwtService = {
  // Genera un token JWT para un usuario (Token de SESIÓN NORMAL)
  generateToken(user) {
    const payload = {
      id: user.id,
      nombre_usuario: user.nombre_usuario,
      rol: user.rol,
    };
    // 🛑 Token de sesión normal, puede durar más tiempo (ej: 1h)
    return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "1h" });
  },

  // Verifica y decodifica un token JWT (Token de SESIÓN NORMAL)
  verifyToken(token) {
    try {
      return jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
      return null;
    }
  },

  // 🚀 NUEVA FUNCIÓN: Genera un token de verificación 2FA
  generate2FAToken(user) {
    const payload = {
      id: user.id,
      // 🛑 No es necesario incluir nombre_usuario o rol aquí, solo el ID
    };
    // 🛑 Token de corta duración (ej: 5 minutos) para evitar ataques de repetición.
    return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "5m" });
  },

  // 🚀 NUEVA FUNCIÓN: Verifica el token de verificación 2FA
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
