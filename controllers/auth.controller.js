const crypto = require("crypto");
const usuarioService = require("../services/usuario.service");
const authService = require("../services/auth.service");
const emailService = require("../services/email.service");
const jwtService = require("../services/jwt.service");
const auth2faService = require("../services/auth2fa.service");

/**
 * Controlador principal para todas las operaciones de Autenticación de Usuario:
 * Registro, Inicio de Sesión (con 2FA inteligente cada 15 días), Confirmación de Email, y Restablecimiento de Contraseña.
 */
const authController = {
  // ===================================================================
  // 📝 REGISTRO Y CONFIRMACIÓN
  // ===================================================================

  /**
   * @async
   * @function register
   * @description Registra un nuevo usuario, hashea la contraseña y dispara el email de confirmación.
   * 🔒 SEGURIDAD: Solo permite campos específicos, ignorando intentos de escalar privilegios
   * @param {object} req - Objeto de solicitud de Express (con datos del usuario en `body`).
   * @param {object} res - Objeto de respuesta de Express.
   */
  async register(req, res) {
    try {
      // 🔒 WHITELIST DE CAMPOS PERMITIDOS - Previene Mass Assignment
      const allowedFields = [
        "email",
        "nombre_usuario",
        "contraseña",
        "dni",
        "nombre",
        "apellido",
        "numero_telefono",
      ];

      // Extraer SOLO los campos permitidos
      const sanitizedData = {};
      allowedFields.forEach((field) => {
        if (req.body[field] !== undefined) {
          sanitizedData[field] = req.body[field];
        }
      });

      const { email, nombre_usuario, contraseña, dni } = sanitizedData;

      // 🎯 1. VALIDACIÓN DE CAMPOS REQUERIDOS
      if (!email || !nombre_usuario || !contraseña || !dni) {
        return res.status(400).json({
          error:
            "Faltan campos requeridos: email, nombre_usuario, contraseña, dni",
        });
      }

      // 🎯 2. VALIDACIÓN DE UNICIDAD DE EMAIL, NOMBRE DE USUARIO Y DNI

      // A. Verificar Email
      const existingUserByEmail = await usuarioService.findByEmail(email);
      if (existingUserByEmail) {
        return res.status(409).json({
          error: "El email ya está asociado a una cuenta activa.",
        });
      }

      // B. Verificar Nombre de Usuario
      const existingUserByUsername =
        await usuarioService.findByUsername(nombre_usuario);
      if (existingUserByUsername) {
        return res.status(409).json({
          error: "El nombre de usuario ya está en uso.",
        });
      }

      // C. Verificar DNI
      const existingUserByDni = await usuarioService.findByDni(dni);
      if (existingUserByDni) {
        return res.status(409).json({
          error: "El DNI proporcionado ya está asociado a una cuenta activa.",
        });
      }

      // 3. Hashear la contraseña usando el servicio de autenticación
      const hashedPassword = await authService.hashPassword(contraseña);

      // 🔒 4. CONSTRUIR EL OBJETO DE USUARIO CON VALORES SEGUROS
      const userData = {
        ...sanitizedData,
        contraseña_hash: hashedPassword,
        rol: "cliente", // 🔒 SIEMPRE cliente por defecto - No se puede cambiar en registro
        activo: false, // Por defecto desactivado hasta confirmar email
        confirmado_email: false,
        is_2fa_enabled: false,
      };

      // Eliminar la contraseña en texto plano del objeto
      delete userData.contraseña;

      // 5. Crear el usuario en la base de datos
      const newUser = await usuarioService.create(userData);

      res.status(201).json({
        message:
          "Usuario registrado exitosamente. Se ha enviado un enlace de confirmación a su correo.",
        user: {
          id: newUser.id,
          nombre_usuario: newUser.nombre_usuario,
          email: newUser.email,
          rol: newUser.rol, // Mostrar que se creó como cliente
        },
      });
    } catch (error) {
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
          "Email confirmado exitosamente. ¡Gracias! ahora puedes iniciar sesión. 🎉",
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
  // 🔑 INICIO DE SESIÓN (CON LÓGICA 2FA INTELIGENTE - 15 DÍAS)
  // ===================================================================

  /**
   * @async
   * @function login
   * @description Procesa el inicio de sesión con verificación 2FA inteligente:
   * - Si 2FA está habilitado Y han pasado más de 15 días desde la última verificación → Requiere 2FA
   * - Si 2FA está habilitado PERO la última verificación fue hace menos de 15 días → Login directo
   * - Si 2FA NO está habilitado → Login directo
   * @param {object} req - Objeto de solicitud de Express (con `identificador` y `contraseña` en `body`).
   * @param {object} res - Objeto de respuesta de Express.
   */
  async login(req, res) {
    try {
      const { identificador, contraseña } = req.body;
      const user = await usuarioService.findByUsernameOrEmail(identificador);

      if (!user) {
        return res.status(401).json({ error: "Credenciales incorrectas." });
      }

      // 1. Verificación de contraseña
      const isMatch = await authService.comparePassword(
        contraseña,
        user.contraseña_hash,
      );

      if (!isMatch) {
        return res.status(401).json({ error: "Credenciales incorrectas." });
      }

      // 2. Verificación de estado de cuenta (Activo / Soft-Delete)
      if (!user.activo) {
        return res.status(403).json({
          error: "Acceso denegado.",
          message:
            "Su cuenta ha sido desactivada. Contacte con soporte para reactivarla.",
        });
      }

      // 3. Verificación de email confirmado
      if (!user.confirmado_email) {
        return res.status(403).json({
          error: "Cuenta no activada.",
          message:
            "Por favor, revise su correo electrónico y haga clic en el enlace de confirmación para activar su cuenta.",
        });
      }

      // 🚀 4. LÓGICA 2FA INTELIGENTE (15 DÍAS) 🚀
      if (user.is_2fa_enabled) {
        // Verificar si han pasado más de 15 días desde la última verificación 2FA
        const necesita2FA = authController._necesitaVerificacion2FA(
          user.last_2fa_verification,
        );

        if (necesita2FA) {
          // Han pasado más de 15 días (o nunca se verificó) → Requiere 2FA
          const twoFaToken = jwtService.generate2FAToken(user);

          return res.status(202).json({
            message: "Se requiere Autenticación de Dos Factores (2FA).",
            twoFaToken: twoFaToken,
            is2FARequired: true,
            user: { id: user.id },
          });
        }
        // Si NO han pasado 15 días, continúa con login normal (sin pedir 2FA)
      }

      // 5. Inicio de Sesión NORMAL (Sin 2FA o dentro del periodo de 15 días)
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
   * @private
   * @function _necesitaVerificacion2FA
   * @description Verifica si han pasado más de 15 días desde la última verificación 2FA
   * @param {Date|null} lastVerification - Fecha de la última verificación 2FA
   * @returns {boolean} true si necesita verificación, false si está dentro del periodo de gracia
   */
  _necesitaVerificacion2FA(lastVerification) {
    if (!lastVerification) {
      // Nunca se ha verificado 2FA en login → Requiere verificación
      return true;
    }

    const ahora = new Date();
    const ultimaVerificacion = new Date(lastVerification);
    const diferenciaDias = (ahora - ultimaVerificacion) / (1000 * 60 * 60 * 24);

    // Si han pasado más de 15 días, requiere nueva verificación
    return diferenciaDias > 15;
  },

  /**
   * @async
   * @function verify2FA
   * @description Verifica el código 2FA (TOTP) usando el token temporal (Paso 2).
   * Si es correcto, actualiza la fecha de última verificación y emite el token JWT de sesión final.
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

      // DOBLE CHECK: El usuario debe estar activo
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

      // 🆕 3. ACTUALIZAR LA FECHA DE ÚLTIMA VERIFICACIÓN 2FA
      await user.update({
        last_2fa_verification: new Date(),
      });

      // 4. ÉXITO: Emitir el token JWT final de sesión
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
   * @param {object} req - Objeto de solicitud de Express (con `email` en `body`).
   * @param {object} res - Objeto de respuesta de Express.
   */
  async forgotPassword(req, res) {
    try {
      const { email } = req.body;
      await usuarioService.generatePasswordResetToken(email);

      // Respuesta genérica por motivos de seguridad (evitar enumeración de usuarios)
      res.status(200).json({
        message:
          "Si existe una cuenta con ese correo, hemos enviado instrucciones para restablecer tu contraseña.",
      });
    } catch (error) {
      console.error("Error en forgotPassword:", error);
      res.status(500).json({ error: "Error al procesar la solicitud." });
    }
  },

  async resetPassword(req, res) {
    try {
      const { token } = req.params;
      const { nueva_contraseña } = req.body;
      const user = await usuarioService.findByResetToken(token);
      if (!user) {
        return res
          .status(400)
          .json({ error: "Token de restablecimiento inválido o expirado." });
      }
      // ✅ Si la cuenta está inactiva, la reactivamos automáticamente (como en resendConfirmation)
      if (!user.activo) {
        console.log(
          `Reactivando cuenta inactiva durante restablecimiento de contraseña: ${user.email}`,
        );
        await user.update({ activo: true });
      }
      const hashedPassword = await authService.hashPassword(nueva_contraseña);
      await user.update({
        contraseña_hash: hashedPassword,
        reset_password_token: null,
        reset_password_expires: null,
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
