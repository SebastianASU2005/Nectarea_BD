// Archivo: controllers/auth.controller.js

const crypto = require("crypto");
const usuarioService = require("../services/usuario.service");
const authService = require("../services/auth.service");
const emailService = require("../services/email.service");
const jwtService = require("../services/jwt.service");
const auth2faService = require("../services/auth2fa.service"); // 🚀 Importación para las funciones de 2FA

/**
 * Controlador principal para todas las operaciones de Autenticación de Usuario:
 * Registro, Inicio de Sesión (con 2FA), Confirmación de Email, y Restablecimiento de Contraseña.
 */
const authController = {
  // ===================================================================
  // 📝 REGISTRO Y CONFIRMACIÓN
  // ===================================================================

  /**
   * @async
   * @function register
   * @description Registra un nuevo usuario, hashea la contraseña y dispara el email de confirmación.
   * @param {object} req - Objeto de solicitud de Express (con datos del usuario en `body`).
   * @param {object} res - Objeto de respuesta de Express.
   */
  async register(req, res) {
    try {
      // 🛑 CAMBIO CLAVE: Incluir 'dni' en la desestructuración
      const { email, nombre_usuario, contraseña, dni } = req.body;

      // 🎯 1. VALIDACIÓN DE UNICIDAD DE EMAIL, NOMBRE DE USUARIO Y DNI

      // A. Verificar Email
      const existingUserByEmail = await usuarioService.findByEmail(email);
      if (existingUserByEmail) {
        return res.status(409).json({
          error: "El email ya está asociado a una cuenta activa.",
        });
      }

      // B. Verificar Nombre de Usuario
      const existingUserByUsername = await usuarioService.findByUsername(
        nombre_usuario
      );
      if (existingUserByUsername) {
        return res.status(409).json({
          error: "El nombre de usuario ya está en uso.",
        });
      }

      // 🚀 C. ¡NUEVA VERIFICACIÓN DE DNI! 🚀
      const existingUserByDni = await usuarioService.findByDni(dni);
      if (existingUserByDni) {
        return res.status(409).json({
          error: "El DNI proporcionado ya está asociado a una cuenta activa.",
        });
      }

      // 2. Hashear la contraseña usando el servicio de autenticación
      const hashedPassword = await authService.hashPassword(contraseña);
      // ... (resto del código igual)

      const userData = {
        ...req.body,
        contraseña_hash: hashedPassword,
      };

      // 3. Crear el usuario en la base de datos (si las validaciones pasan)
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
      // ... (manejo de error)
      res.status(400).json({ error: error.message });
    }
  },
  /**
   * @async
   * @function confirmarEmail
   * @description Confirma la cuenta del usuario utilizando el token enviado por email.
   * @param {object} req - Objeto de solicitud de Express (con `token` en `params`).
   * @param {object} res - Objeto de respuesta de Express.
   */
  async confirmarEmail(req, res) {
    try {
      const { token } = req.params;

      await usuarioService.confirmEmail(token);

      res.status(200).json({
        message:
          "Email confirmado exitosamente. ¡Gracias! Ahora puedes iniciar sesión. 🎉",
      });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  /**
   * @async
   * @function resendConfirmation
   * @description Reenvía el email de confirmación al usuario si su cuenta no está activada.
   * @param {object} req - Objeto de solicitud de Express (con `email` en `body`).
   * @param {object} res - Objeto de respuesta de Express.
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

  // ===================================================================
  // 🔑 INICIO DE SESIÓN (CON LÓGICA 2FA)
  // ===================================================================

  /**
   * @async
   * @function login
   * @description Procesa el inicio de sesión. Permite ingresar con nombre de usuario O email.
   * @param {object} req - Objeto de solicitud de Express (con `identificador` y `contraseña` en `body`). ⬅️ DOC ACTUALIZADA
   * @param {object} res - Objeto de respuesta de Express.
   */
  async login(req, res) {
    try {
      // 🛑 CAMBIO 1: Cambiar 'nombre_usuario' por 'identificador' para aceptar ambos (usuario o email)
      const { identificador, contraseña } = req.body; // 🛑 CAMBIO 2: Usar la nueva función del servicio que busca por cualquiera de los dos campos
      const user = await usuarioService.findByUsernameOrEmail(identificador);

      if (!user) {
        return res.status(401).json({ error: "Credenciales incorrectas." });
      } // 1. Verificación de contraseña

      const isMatch = await authService.comparePassword(
        contraseña,
        user.contraseña_hash
      );

      if (!isMatch) {
        return res.status(401).json({ error: "Credenciales incorrectas." });
      } // 2. Verificación de estado de cuenta (Activo / Soft-Delete)

      if (!user.activo) {
        return res.status(403).json({
          error: "Acceso denegado.",
          message:
            "Su cuenta ha sido desactivada. Contacte con soporte para reactivarla.",
        });
      } // 3. Verificación de email confirmado

      if (!user.confirmado_email) {
        return res.status(403).json({
          error: "Cuenta no activada.",
          message:
            "Por favor, revise su correo electrónico y haga clic en el enlace de confirmación para activar su cuenta.",
        });
      } // 🚀 4. LÓGICA CLAVE PARA 2FA (Paso 1: Emisión de token temporal) 🚀

      if (user.is_2fa_enabled) {
        // Si 2FA está activo, emitir un token temporal para el proceso de verificación 2FA.
        const twoFaToken = jwtService.generate2FAToken(user);

        return res.status(202).json({
          message: "Se requiere Autenticación de Dos Factores (2FA).",
          twoFaToken: twoFaToken, // Token temporal para el siguiente paso (`verify2FA`)
          is2FARequired: true,
          user: { id: user.id },
        });
      } // 5. Inicio de Sesión NORMAL (Si 2FA NO está habilitado)

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
   * @async
   * @function verify2FA
   * @description Verifica el código 2FA (TOTP) usando el token temporal (Paso 2).
   * Si es correcto, emite el token JWT de sesión final.
   * @param {object} req - Objeto de solicitud de Express (con `twoFaToken` y `token` TOTP en `body`).
   * @param {object} res - Objeto de respuesta de Express.
   */
  async verify2FA(req, res) {
    try {
      const { twoFaToken, token } = req.body; // twoFaToken: JWT temporal; token: Código TOTP

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

      // 🛑 DOBLE CHECK: El usuario debe estar activo
      if (!user.activo) {
        return res.status(403).json({
          error: "Acceso denegado.",
          message: "Su cuenta ha sido desactivada.",
        });
      }

      // 2. Verificar el código TOTP
      const isVerified = auth2faService.verifyToken(user.twofa_secret, token);

      if (!isVerified) {
        return res.status(401).json({ error: "Código 2FA incorrecto." });
      }

      // 3. ÉXITO: Emitir el token JWT final de sesión
      const finalToken = jwtService.generateToken(user);

      res.status(200).json({
        message: "Inicio de sesión 2FA exitoso. ✅",
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
   * @async
   * @function logout
   * @description Cierra la sesión del usuario. En sistemas JWT, indica al cliente que elimine su token.
   * @param {object} req - Objeto de solicitud de Express.
   * @param {object} res - Objeto de respuesta de Express.
   */
  async logout(req, res) {
    // La responsabilidad de eliminar el token recae en el cliente (frontend)
    res.status(200).json({
      message:
        "Sesión cerrada exitosamente. Elimine el token de su almacenamiento local.",
      token: null, // Indicador para el cliente
    });
  },

  // ===================================================================
  // 🔒 RESTABLECIMIENTO DE CONTRASEÑA
  // ===================================================================

  /**
   * @async
   * @function forgotPassword
   * @description Genera un token de restablecimiento de contraseña y envía el enlace por email.
   * Envía una respuesta genérica por motivos de seguridad (evitar enumeración de emails).
   * @param {object} req - Objeto de solicitud de Express (con `email` en `body`).
   * @param {object} res - Objeto de respuesta de Express.
   */
  async forgotPassword(req, res) {
    try {
      const { email } = req.body;

      const resetToken = await usuarioService.generatePasswordResetToken(email);

      if (resetToken) {
        // Generar el enlace de restablecimiento (usar la URL del frontend)
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

      // Respuesta genérica por motivos de seguridad
      res.status(200).json({
        message:
          "Si existe una cuenta con ese correo, hemos enviado instrucciones para restablecer tu contraseña.",
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  /**
   * @async
   * @function resetPassword
   * @description Restablece la contraseña del usuario usando el token.
   * @param {object} req - Objeto de solicitud de Express (con `token` en `params` y `nueva_contraseña` en `body`).
   * @param {object} res - Objeto de respuesta de Express.
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

      res.status(200).json({
        message:
          "Contraseña restablecida exitosamente. Ya puedes iniciar sesión.",
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
};

module.exports = authController;
