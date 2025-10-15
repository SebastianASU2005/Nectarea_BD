// Añadir la importación del servicio de usuario
const jwtService = require("../services/jwt.service");
const usuarioService = require("../services/usuario.service");

const authMiddleware = {
  // Middleware para verificar que el usuario está autenticado
  async authenticate(req, res, next) {
    try {
      // 1. Obtener y verificar el token
      const authHeader = req.headers["authorization"];
      if (!authHeader) {
        return res.status(401).json({ error: "Token no proporcionado." });
      }

      const token = authHeader.split(" ")[1];
      if (!token) {
        return res.status(401).json({ error: "Formato de token inválido." });
      } // Usamos verifyToken que verifica el JWT_SECRET

      const decodedToken = jwtService.verifyToken(token);
      if (!decodedToken) {
        return res.status(401).json({ error: "Token inválido o expirado." });
      } // 2. Obtener el usuario de la BD

      const usuario = await usuarioService.findById(decodedToken.id);

      if (!usuario) {
        return res
          .status(404)
          .json({ error: "Usuario asociado al token no encontrado." });
      }

      // 🛑 3. VERIFICACIÓN DE ESTADO ACTIVO (CLAVE PARA SOFT DELETE) 🛑
      if (!usuario.activo) {
        // Si el usuario está inactivo (eliminado lógicamente), forzamos el deslogeo
        return res
          .status(403)
          .json({ error: "Acceso denegado. Su cuenta ha sido desactivada." });
      } // 🛑 4. Bloquear si 2FA está activo pero no fue completado 🛑

      if (usuario.is_2fa_enabled) {
        // Verificamos si el token tiene el campo 'rol', lo que indica que es un token de SESIÓN FINAL.
        if (!decodedToken.rol) {
          // Si el token es solo el temporal (que solo tiene 'id'), y el 2FA está activo, ¡Bloquear!
          return res.status(403).json({
            error:
              "Acceso denegado. Se requiere completar la verificación 2FA.",
          });
        }
      } // 🛑 5. (Verificación de email ya existente, pero clave) 🛑

      if (!usuario.confirmado_email) {
        return res
          .status(403)
          .json({ error: "Acceso denegado. Confirme su correo electrónico." });
      } // 6. Almacenar los datos del usuario

      req.user = usuario;
      next();
    } catch (error) {
      // Usar status 401 si el error es por un token que el verifyToken no pudo decodificar
      res
        .status(401)
        .json({ error: "Token inválido o expirado. Vuelva a iniciar sesión." });
    }
  },
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
