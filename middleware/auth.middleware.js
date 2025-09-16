// middleware/auth.middleware.js
const jwtService = require('../services/jwt.service');

const authMiddleware = {
  // Middleware para verificar que el usuario está autenticado
  authenticate(req, res, next) {
    try {
      // 1. Obtener el token del encabezado 'Authorization'
      const authHeader = req.headers['authorization'];
      if (!authHeader) {
        return res.status(401).json({ error: 'Token no proporcionado.' });
      }

      // El encabezado es 'Bearer <token>', así que lo separamos
      const token = authHeader.split(' ')[1];
      if (!token) {
        return res.status(401).json({ error: 'Formato de token inválido.' });
      }

      // 2. Verificar si el token es válido
      const decodedToken = jwtService.verifyToken(token);
      if (!decodedToken) {
        return res.status(401).json({ error: 'Token inválido o expirado.' });
      }

      // 3. Almacenar los datos del usuario en el objeto 'req' para su uso posterior
      req.user = decodedToken;
      next(); // Continúa al siguiente middleware o a la función del controlador

    } catch (error) {
      res.status(500).json({ error: 'Error de autenticación.' });
    }
  },

  // Middleware para verificar el rol de administrador
  authorizeAdmin(req, res, next) {
    // El rol del usuario ya está en 'req.user' gracias al middleware anterior
    if (req.user && req.user.rol === 'admin') {
      next(); // El usuario es admin, continúa
    } else {
      res.status(403).json({ error: 'Acceso denegado. Se requiere rol de administrador.' });
    }
  },
};

module.exports = authMiddleware;    