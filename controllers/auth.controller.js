const crypto = require("crypto");
const usuarioService = require("../services/usuario.service");
const authService = require("../services/auth.service");
const emailService = require("../services/email.service");
const jwtService = require("../services/jwt.service");

const authController = {
  // Función para registrar un nuevo usuario
  async register(req, res) {
    try {
      // 1. Hashear la contraseña antes de guardarla (Correcto, debe estar aquí)
      const hashedPassword = await authService.hashPassword(
        req.body.contraseña
      );

      const userData = {
        ...req.body,
        contraseña_hash: hashedPassword, // 🛑 ELIMINAMOS LA GENERACIÓN DE TOKEN Y EXPIRACIÓN DE AQUÍ 🛑 // Estos campos y el envío del email se manejan ahora dentro de usuarioService.create
      }; // 2. Crear el usuario en la base de datos (Este llama al servicio que crea el token y envía el email)

      const newUser = await usuarioService.create(userData);

      res.status(201).json({
        message:
          "Usuario registrado exitosamente. Se ha enviado un enlace de confirmación a su correo.",
        user: {
          id: newUser.id,
          nombre_usuario: newUser.nombre_usuario,
          email: newUser.email,
        },
      });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }, // Función para el inicio de sesión (Esta parte está correcta y lista)

  async login(req, res) {
    try {
      const { nombre_usuario, contraseña } = req.body;
      const user = await usuarioService.findByUsername(nombre_usuario);

      if (!user) {
        return res.status(401).json({ error: "Credenciales incorrectas." });
      }

      const isMatch = await authService.comparePassword(
        contraseña,
        user.contraseña_hash
      );

      if (!isMatch) {
        return res.status(401).json({ error: "Credenciales incorrectas." });
      }

      if (!user.confirmado_email) {
        return res.status(403).json({
          error: "Cuenta no activada.",
          message:
            "Por favor, revise su correo electrónico y haga clic en el enlace de confirmación para activar su cuenta.",
        });
      }

      const token = jwtService.generateToken(user);

      res.status(200).json({
        message: "Inicio de sesión exitoso.",
        token: token,
        user: {
          id: user.id,
          nombre_usuario: user.nombre_usuario,
          rol: user.rol,
        },
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
  /**
   * 🚀 NUEVO CONTROLADOR: Reenvía el email de confirmación al usuario.
   */
  async resendConfirmation(req, res) {
    try {
      const { email } = req.body;

      await usuarioService.resendConfirmationEmail(email); // Respuesta genérica por seguridad, sin importar si el email existía o no.

      res.status(200).json({
        message:
          "Si su cuenta necesita ser activada, hemos enviado un nuevo enlace a su correo electrónico.",
      });
    } catch (error) {
      // Muestra el error específico solo si es que el correo no pudo ser enviado
      // o si la cuenta ya estaba confirmada.
      res.status(400).json({ error: error.message });
    }
  },  
  // Función para confirmar el email del usuario

  async confirmarEmail(req, res) {
    try {
      const { token } = req.params; // 🛑 CAMBIO CLAVE: Llamar a usuarioService.confirmEmail para manejar la lógica de la BD 🛑 // Esto evita la duplicación de código y errores de lógica.

      await usuarioService.confirmEmail(token);

      res.status(200).json({
        message:
          "Email confirmado exitosamente. ¡Gracias! Ahora puedes iniciar sesión.",
      });
    } catch (error) {
      // El servicio lanza el error 400 por token inválido o expirado.
      res.status(400).json({ error: error.message });
    }
  },
};

module.exports = authController;
