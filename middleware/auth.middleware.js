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
      }

      // Usamos verifyToken que verifica el JWT_SECRET
      const decodedToken = jwtService.verifyToken(token);
      if (!decodedToken) {
        return res.status(401).json({ error: "Token inválido o expirado." });
      }

      // 2. Obtener el usuario de la BD
      const usuario = await usuarioService.findById(decodedToken.id);

      if (!usuario) {
        return res
          .status(404)
          .json({ error: "Usuario asociado al token no encontrado." });
      }

      // 🛑 3. VERIFICACIÓN CLAVE: Bloquear si 2FA está activo pero no fue completado 🛑

      // La verificación clave aquí es:
      // Si el usuario tiene 2FA habilitado (is_2fa_enabled: true)
      // Y, además, el usuario NO ha completado la confirmación de email (confirmado_email: false)
      // O, MÁS IMPORTANTE, si el token utilizado NO ES un token de sesión final.

      // Dado que estás usando el MISMO JWT_SECRET para ambos tokens:
      // Debemos asegurar que el middleware SOLO permita el acceso si el 2FA está completado.

      if (usuario.is_2fa_enabled) {
        // El token temporal de 2FA (twoFaToken) no debería tener el campo 'rol' o 'nombre_usuario'
        // En cambio, el token final SÍ los tiene (mira tu jwt.service.js)

        // UNA SOLUCIÓN LIMPIA ES VERIFICAR SI EL TOKEN ES UN TOKEN DE SESIÓN FINAL
        // Al revisar si tiene el campo 'rol' que solo le ponemos al token final.

        if (!decodedToken.rol) {
          // Si el token es solo el token temporal (que solo tiene 'id'), y el 2FA está activo, ¡Bloquear!
          return res
            .status(403)
            .json({
              error:
                "Acceso denegado. Se requiere completar la verificación 2FA.",
            });
        }
      }

      // 🛑 4. (Verificación de email ya existente, pero clave) 🛑
      if (!usuario.confirmado_email) {
        return res
          .status(403)
          .json({ error: "Acceso denegado. Confirme su correo electrónico." });
      }

      // 5. Almacenar los datos del usuario
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
