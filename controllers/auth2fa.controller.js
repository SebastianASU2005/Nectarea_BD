// Archivo: controllers/auth2fa.controller.js

const auth2faService = require("../services/auth2fa.service");
const usuarioService = require("../services/usuario.service");

/**
 * Controlador de Express para gestionar el ciclo de vida de la Autenticación de Dos Factores (2FA).
 * Incluye generación del secreto, verificación/activación y desactivación.
 */
const auth2faController = {
  // ===================================================================
  // 1. GENERAR SECRETO Y QR
  // ===================================================================

  /**
   * @async
   * @function generate2FASecret
   * @description Genera un secreto TOTP temporal y devuelve la URL (otpauth://) para el código QR.
   * Almacena el secreto temporalmente en la DB del usuario.
   * @param {object} req - Objeto de solicitud de Express (con `req.user` del JWT).
   * @param {object} res - Objeto de respuesta de Express.
   */
  async generate2FASecret(req, res) {
    try {
      const user = req.user; // Obtenido del middleware de autenticación

      if (user.is_2fa_enabled) {
        return res.status(400).json({ error: "El 2FA ya está habilitado." });
      }

      // Generar el secreto Base32 y la URL del Código QR
      const { secret, otpauthUrl } = auth2faService.generateSecret(user.email);

      // 🛑 NOTA IMPORTANTE DE SEGURIDAD:
      // Se guarda el secreto temporalmente en la base de datos (DB).
      // En producción, es altamente recomendable usar una **caché segura (ej. Redis)** o una tabla temporal
      // para evitar exponer este secreto si la DB fuera comprometida antes de la verificación final.
      await usuarioService.update(user.id, { twofa_secret: secret });

      res.status(200).json({
        message: "Escanee el código QR para configurar la aplicación.",
        secret: secret, // Secreto Base32 (opcional: solo para propósitos de prueba/emergencia)
        otpauthUrl: otpauthUrl, // La URL a convertir en Código QR por el frontend
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // ===================================================================
  // 2. VERIFICAR Y HABILITAR PERMANENTEMENTE
  // ===================================================================

  /**
   * @async
   * @function verifyAndEnable2FA
   * @description Verifica el código TOTP proporcionado con el secreto temporal. Si es correcto,
   * habilita el 2FA permanentemente para el usuario en la base de datos.
   * @param {object} req - Objeto de solicitud de Express (con `req.user` y `token` en `body`).
   * @param {object} res - Objeto de respuesta de Express.
   */
  async verifyAndEnable2FA(req, res) {
    try {
      const user = req.user;
      const { token } = req.body; // El código TOTP de 6 dígitos

      if (user.is_2fa_enabled) {
        return res.status(400).json({ error: "El 2FA ya está habilitado." });
      }
      if (!user.twofa_secret) {
        // Asegura que el usuario haya pasado por el primer paso (generate2FASecret)
        return res
          .status(400)
          .json({ error: "Primero genere la clave secreta." });
      }

      // Verifica el código TOTP usando el secreto almacenado temporalmente
      const isVerified = auth2faService.verifyToken(user.twofa_secret, token);

      if (!isVerified) {
        return res.status(401).json({ error: "Código 2FA inválido." });
      }

      // 🚀 Habilitar permanentemente el 2FA en la DB y, opcionalmente, borrar la clave temporal
      await auth2faService.enable2FA(user.id, user.twofa_secret);

      res.status(200).json({
        message: "¡Autenticación de Dos Factores habilitada exitosamente! ✅",
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // ===================================================================
  // 3. DESHABILITAR (Requiere 2FA y Contraseña)
  // ===================================================================

  /**
   * @async
   * @function disable2FA
   * @description Deshabilita el 2FA. Requiere que el usuario proporcione su contraseña
   * y el código TOTP actual para mayor seguridad.
   * @param {object} req - Objeto de solicitud de Express (con `req.user`, `contraseña` y `token` en `body`).
   * @param {object} res - Objeto de respuesta de Express.
   */
  async disable2FA(req, res) {
    try {
      // El userId viene del JWT ya decodificado por el middleware
      const userId = req.user.id;
      const { contraseña, token } = req.body; // `token` es el código TOTP

      // El servicio manejará la verificación de contraseña, verificación TOTP y la actualización de la DB
      await auth2faService.disable2FA(userId, contraseña, token);

      res.status(200).json({
        message:
          "La verificación en dos pasos (2FA) ha sido deshabilitada exitosamente. 🔒",
      });
    } catch (error) {
      // Muestra error si la contraseña, el código TOTP, o el estado de 2FA son incorrectos
      // El servicio debe asegurar que el mensaje de error sea específico (ej. "Contraseña incorrecta", "Código 2FA inválido")
      res.status(400).json({ error: error.message });
    }
  },
};

module.exports = auth2faController;
