// Añadir la importación del servicio de usuario
const jwtService = require("../services/jwt.service");
const usuarioService = require("../services/usuario.service");

const authMiddleware = {
  // Middleware para verificar que el usuario está autenticado
  async authenticate(req, res, next) {
    // 🛑 Hacer la función ASYNC
    try {
      // 1. Obtener el token del encabezado 'Authorization'
      const authHeader = req.headers["authorization"];
      if (!authHeader) {
        return res.status(401).json({ error: "Token no proporcionado." });
      } // El encabezado es 'Bearer <token>', así que lo separamos

      const token = authHeader.split(" ")[1];
      if (!token) {
        return res.status(401).json({ error: "Formato de token inválido." });
      } // 2. Verificar si el token es válido

      const decodedToken = jwtService.verifyToken(token);
      if (!decodedToken) {
        return res.status(401).json({ error: "Token inválido o expirado." });
      }

      // 3. Obtener el usuario de la BD (asumimos que el token tiene el ID del usuario)
      const usuario = await usuarioService.findById(decodedToken.id);

      if (!usuario) {
        return res
          .status(404)
          .json({ error: "Usuario asociado al token no encontrado." });
      }

      // 🛑 4. VERIFICACIÓN CLAVE: Bloquear si el email no está confirmado 🛑
      if (!usuario.confirmado_email) {
        // Devolver 403 (Prohibido) o 401 (No Autorizado) según tu preferencia,
        // pero 403 es más apropiado aquí.
        return res
          .status(403)
          .json({ error: "Acceso denegado. Confirme su correo electrónico." });
      } // 5. Almacenar los datos del usuario en el objeto 'req'

      req.user = usuario; // Almacenamos el objeto completo de Sequelize
      next(); // Continúa al siguiente middleware o a la función del controlador
    } catch (error) {
      res
        .status(500)
        .json({ error: "Error interno de autenticación: " + error.message });
    }
  }, // Middleware para verificar el rol de administrador

  authorizeAdmin(req, res, next) {
    // El rol del usuario ya está en 'req.user' gracias al middleware anterior
    if (req.user && req.user.rol === "admin") {
      next(); // El usuario es admin, continúa
    } else {
      res
        .status(403)
        .json({ error: "Acceso denegado. Se requiere rol de administrador." });
    }
  },
};

module.exports = authMiddleware;
