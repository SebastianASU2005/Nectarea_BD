// Archivo: controllers/auth.controller.js

const crypto = require("crypto");
const usuarioService = require("../services/usuario.service");
const authService = require("../services/auth.service");
const emailService = require("../services/email.service");
const jwtService = require("../services/jwt.service");
const auth2faService = require("../services/auth2fa.service"); // 🚀 NUEVA IMPORTACIÓN PARA 2FA

const authController = {
  // Función para registrar un nuevo usuario
  async register(req, res) {
    try {
      // 1. Hashear la contraseña
      const hashedPassword = await authService.hashPassword(
        req.body.contraseña
      );

      const userData = {
        ...req.body,
        contraseña_hash: hashedPassword,
      };

      // 2. Crear el usuario en la base de datos (maneja token de confirmación y email)
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
  },

  // Función para el inicio de sesión (MODIFICADA PARA 2FA)
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

      // 🚀 LÓGICA CLAVE PARA 2FA (Paso 1) 🚀
      if (user.is_2fa_enabled) {
        // Si 2FA está activo, emitir un token temporal para el proceso de verificación 2FA.
        const twoFaToken = jwtService.generate2FAToken(user);

        return res.status(202).json({
          message: "Se requiere Autenticación de Dos Factores (2FA).",
          twoFaToken: twoFaToken, // Token temporal para el siguiente paso
          is2FARequired: true,
          user: { id: user.id },
        });
      }
      // 🚀 FIN DE LA LÓGICA DE 2FA 🚀

      // CÓDIGO NORMAL DE LOGIN (Si 2FA NO está habilitado)
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
   * 🚀 NUEVO CONTROLADOR: Verifica el código 2FA y emite el token JWT final (Paso 2).
   */
  async verify2FA(req, res) {
    try {
      const { twoFaToken, token } = req.body; // twoFaToken: JWT temporal; token: Código TOTP de 6 dígitos

      // 1. Verificar el token temporal 2FA
      const decodedTwoFa = jwtService.verify2FAToken(twoFaToken);
      if (!decodedTwoFa) {
        return res
          .status(401)
          .json({ error: "Token de verificación 2FA inválido o expirado." });
      }

      const user = await usuarioService.findById(decodedTwoFa.id);

      if (!user || !user.is_2fa_enabled || !user.twofa_secret) {
        return res
          .status(400)
          .json({ error: "Configuración 2FA inválida o no habilitada." });
      }

      // 2. Verificar el código TOTP
      const isVerified = auth2faService.verifyToken(user.twofa_secret, token);

      if (!isVerified) {
        return res.status(401).json({ error: "Código 2FA incorrecto." });
      }

      // 3. ÉXITO: Emitir el token JWT final de sesión
      const finalToken = jwtService.generateToken(user);

      res.status(200).json({
        message: "Inicio de sesión 2FA exitoso.",
        token: finalToken,
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
   * Reenvía el email de confirmación al usuario.
   */
  async resendConfirmation(req, res) {
    try {
      const { email } = req.body;

      await usuarioService.resendConfirmationEmail(email);

      res.status(200).json({
        message:
          "Si su cuenta necesita ser activada, hemos enviado un nuevo enlace a su correo electrónico.",
      });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },
  /**
   * 🚀 NUEVO CONTROLADOR: Cierra la sesión del usuario.
   * En sistemas JWT, esto solo indica al cliente que elimine su token.
   */
  async logout(req, res) {
    // La acción real de eliminar el token la debe hacer el cliente (frontend).
    // El servidor simplemente confirma la acción y puede enviar un token 'nulo' o vacío.
    res.status(200).json({
      message:
        "Sesión cerrada exitosamente. Elimine el token de su almacenamiento local.",
      token: null, // Indica al cliente que ya no hay token válido
    });
  },
  /**
   * 🚀 NUEVO: Envía un email con el enlace de restablecimiento de contraseña.
   */
  async forgotPassword(req, res) {
    try {
      const { email } = req.body;

      const resetToken = await usuarioService.generatePasswordResetToken(email);

      // 🛑 Si el usuario no existe, enviamos una respuesta genérica para evitar enumeración.
      if (resetToken) {
        // Generar el enlace de restablecimiento.
        // Asegúrate de usar la URL base de tu frontend.
        const resetLink = `http://localhost:3000/reset-password/${resetToken}`;

        const emailHtml = `
                    <p>Has solicitado restablecer tu contraseña.</p>
                    <p>Haz clic en el siguiente enlace para completar el proceso:</p>
                    <a href="${resetLink}">Restablecer Contraseña</a>
                    <p>Este enlace expirará en una hora.</p>
                `;

        await emailService.sendEmail(
          email,
          "Restablecimiento de Contraseña",
          emailHtml
        );
      }

      // Respuesta genérica por motivos de seguridad, sin importar si el correo existía.
      res.status(200).json({
        message:
          "Si existe una cuenta con ese correo, hemos enviado instrucciones para restablecer tu contraseña.",
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  /**
   * 🚀 NUEVO: Restablece la contraseña usando el token y la nueva contraseña.
   */
  async resetPassword(req, res) {
    try {
      const { token } = req.params; // Token del enlace
      const { nueva_contraseña } = req.body;

      // 1. Verificar el token y su expiración
      const user = await usuarioService.findByResetToken(token);

      if (!user) {
        return res
          .status(400)
          .json({ error: "Token de restablecimiento inválido o expirado." });
      }

      // 2. Hashear la nueva contraseña
      const hashedPassword = await authService.hashPassword(nueva_contraseña);

      // 3. Actualizar la contraseña y limpiar el token/expiración en la BD
      await user.update({
        contraseña_hash: hashedPassword,
        reset_password_token: null, // Limpiar
        reset_password_expires: null, // Limpiar
      });

      // 4. (Opcional) Notificar por email que la contraseña ha cambiado por seguridad.

      res
        .status(200)
        .json({
          message:
            "Contraseña restablecida exitosamente. Ya puedes iniciar sesión.",
        });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // Función para confirmar el email del usuario
  async confirmarEmail(req, res) {
    try {
      const { token } = req.params;

      await usuarioService.confirmEmail(token);

      res.status(200).json({
        message:
          "Email confirmado exitosamente. ¡Gracias! Ahora puedes iniciar sesión.",
      });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },
};

module.exports = authController;
