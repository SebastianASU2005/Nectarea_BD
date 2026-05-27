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
      if (usuario.token_version !== (decodedToken.token_version ?? 0)) {
        return res.status(401).json({
          error:
            "Su sesión ha sido cerrada porque otro usuario inició sesión con la misma cuenta.",
        });
      }
      if (
        decodedToken.token_version !== undefined &&
        usuario.token_version !== decodedToken.token_version
      ) {
        return res.status(401).json({
          error:
            "Su sesión ha sido cerrada porque otro usuario inició sesión con la misma cuenta.",
        });
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
  authorizeAdmin: async (req, res, next) => {
    // ⬅️ HACER ESTA FUNCIÓN ASÍNCRONA
    // 1. Obtener el ID del usuario del payload del token (que ya está en req.user)
    const userId = req.user.id;

    try {
      // 2. 🚨 CONSULTAR DIRECTAMENTE A LA BD para obtener solo el rol actual
      const usuarioActualizado = await usuarioService.findById(userId);

      // 3. Verificar la existencia y el rol
      if (usuarioActualizado && usuarioActualizado.rol === "admin") {
        next(); // Autorización concedida
      } else {
        // Si el usuario no existe o el rol no es admin (403 Forbidden)
        res.status(403).json({
          error: "Acceso denegado. Se requiere rol de administrador.",
        });
      }
    } catch (error) {
      // En caso de error de BD, negar el acceso por defecto
      res
        .status(500)
        .json({ error: "Error de servidor al verificar la autorización." });
    }
  },
};

module.exports = authMiddleware;
