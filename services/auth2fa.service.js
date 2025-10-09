// Archivo: services/auth2fa.service.js

const speakeasy = require("speakeasy");
const Usuario = require("../models/usuario"); // Asumo que el modelo Usuario está accesible
// 🛑 CORRECCIÓN: DEBES IMPORTAR LOS SERVICIOS NECESARIOS 🛑
const usuarioService = require("./usuario.service"); 
const authService = require("./auth.service"); 

const auth2faService = {
  /**
   * Genera la clave secreta y la URL para la aplicación de autenticación.
   * @param {string} email - El email del usuario para incluir en la URL.
   * @returns {{secret: string, otpauthUrl: string}} Objeto con el secreto y la URL QR.
   */
  generateSecret(email) {
    const secret = speakeasy.generateSecret({
      name: `NombreApp | ${email}`, // Reemplaza 'NombreApp'
      length: 20,
    });

    return {
      secret: secret.base32,
      otpauthUrl: secret.otpauth_url,
    };
  },

  /**
   * Verifica el código TOTP proporcionado por el usuario.
   * @param {string} secret - La clave secreta almacenada en la DB.
   * @param {string} token - El código de 6 dígitos introducido por el usuario.
   * @returns {boolean} True si el código es válido dentro de la ventana de tiempo.
   */
  verifyToken(secret, token) {
    return speakeasy.totp.verify({
      secret: secret,
      encoding: "base32",
      token: token,
      window: 1, // Permite 1 paso de tiempo antes o después (30 segundos)
    });
  },

  /**
   * Habilita permanentemente el 2FA para el usuario.
   * @param {number} userId - ID del usuario.
   * @param {string} secret - El secreto validado.
   */
  async enable2FA(userId, secret) {
    const user = await Usuario.findByPk(userId);
    if (!user) {
      throw new Error("Usuario no encontrado.");
    }

    await user.update({
      is_2fa_enabled: true,
      twofa_secret: secret,
    });
  },
  /**
   * Verifica la contraseña y el código 2FA, y si ambos son correctos,
   * deshabilita el 2FA en la base de datos para el usuario.
   */
  async disable2FA(userId, currentPassword, totpCode) {
    const user = await usuarioService.findById(userId);

    if (!user || !user.is_2fa_enabled) {
      throw new Error("El usuario no existe o el 2FA ya está deshabilitado.");
    }

    // 1. Verificar la contraseña actual
    const passwordMatch = await authService.comparePassword(
      currentPassword,
      user.contraseña_hash
    );

    if (!passwordMatch) {
      throw new Error("Contraseña incorrecta.");
    }

    // 2. Verificar el código TOTP actual
    const isTotpValid = auth2faService.verifyToken(user.twofa_secret, totpCode);

    if (!isTotpValid) {
      throw new Error("Código 2FA incorrecto.");
    }

    // 3. DESACTIVAR 2FA en la base de datos
    await user.update({
      is_2fa_enabled: false,
      twofa_secret: null, // CRÍTICO: Eliminar el secreto
    });

    return true;
  },
};

module.exports = auth2faService;
