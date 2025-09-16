// services/jwt.service.js
const jwt = require('jsonwebtoken');
require('dotenv').config();

const jwtService = {
  // Genera un token JWT para un usuario
  generateToken(user) {
    const payload = {
      id: user.id,
      nombre_usuario: user.nombre_usuario,
      rol: user.rol,
    };
    return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });
  },

  // Verifica y decodifica un token JWT
  verifyToken(token) {
    try {
      return jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
      return null;
    }
  },
};

module.exports = jwtService;