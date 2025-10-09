// Archivo: controllers/auth2fa.controller.js

const auth2faService = require("../services/auth2fa.service");
const usuarioService = require("../services/usuario.service");

const auth2faController = {
  /**
   * 1. Genera el secreto temporal y devuelve la URL (para el código QR).
   * Requiere autenticación de usuario (req.user.id).
   */
  async generate2FASecret(req, res) {
    try {
      const user = req.user; // Obtenido del middleware de autenticación

      if (user.is_2fa_enabled) {
        return res.status(400).json({ error: "El 2FA ya está habilitado." });
      }

      const { secret, otpauthUrl } = auth2faService.generateSecret(user.email);

      // 🛑 Guardar temporalmente el secreto en la sesión/cache/DB (¡Asegúrese de usar una caché segura!)
      // POR SIMPLICIDAD, LO ALMACENAREMOS TEMPORALMENTE EN EL OBJETO DE USUARIO DE LA BD (Mala práctica en producción, use Redis o similar)
      // En la vida real, se usa un token temporal o se guarda en una tabla de "2FA_Setup".
      await usuarioService.update(user.id, { twofa_secret: secret });

      res.status(200).json({
        message: "Escanee el código QR para configurar la aplicación.",
        secret: secret, // Secreto Base32 (solo para propósitos de prueba/emergencia)
        otpauthUrl: otpauthUrl, // La URL a convertir en Código QR
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  /**
   * 2. Verifica el código TOTP y habilita el 2FA permanentemente.
   * Requiere autenticación de usuario y el código (token).
   */
  async verifyAndEnable2FA(req, res) {
    try {
      const user = req.user;
      const { token } = req.body;

      if (user.is_2fa_enabled) {
        return res.status(400).json({ error: "El 2FA ya está habilitado." });
      }
      if (!user.twofa_secret) {
        return res.status(400).json({ error: "Primero genere la clave secreta." });
      }

      const isVerified = auth2faService.verifyToken(user.twofa_secret, token);

      if (!isVerified) {
        return res.status(401).json({ error: "Código 2FA inválido." });
      }

      // 🚀 Habilitar permanentemente el 2FA en la DB
      await auth2faService.enable2FA(user.id, user.twofa_secret);

      res.status(200).json({
        message: "¡Autenticación de Dos Factores habilitada exitosamente!",
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
  /**
     * 🚀 NUEVO: Deshabilita el 2FA. Requiere JWT, contraseña y código TOTP.
     */
    async disable2FA(req, res) {
        try {
            // El userId viene del JWT ya decodificado por el middleware
            const userId = req.user.id; 
            const { contraseña, token } = req.body; // token es el código TOTP

            await auth2faService.disable2FA(userId, contraseña, token);

            res.status(200).json({
                message: "La verificación en dos pasos (2FA) ha sido deshabilitada exitosamente.",
            });
            
        } catch (error) {
            // Muestra error si la contraseña o el código TOTP son incorrectos
            res.status(400).json({ error: error.message });
        }
    }
};

module.exports = auth2faController;