// Archivo: services/auth2fa.service.js

const speakeasy = require("speakeasy");
const Usuario = require("../models/usuario"); // Asumo que el modelo Usuario está accesible
// Servicios importados para las validaciones
const usuarioService = require("./usuario.service");
const authService = require("./auth.service");

/**
 * Servicio para la gestión de la autenticación de dos factores (2FA)
 * basada en Time-based One-time Password (TOTP) utilizando speakeasy.
 */
const auth2faService = {
  /**
   * @function generateSecret
   * @description Genera la clave secreta Base32 y la URL de provisión (otpauth)
   * para que el usuario la escanee en una aplicación TOTP (ej: Google Authenticator).
   * @param {string} email - El email del usuario para incluir en el nombre de la cuenta en la app TOTP.
   * @returns {{secret: string, otpauthUrl: string}} Objeto con el secreto y la URL QR.
   */
  generateSecret(email) {
    const secret = speakeasy.generateSecret({
      name: `NombreApp | ${email}`, // Reemplaza 'NombreApp' con el nombre real de tu aplicación
      length: 20, // Longitud de la clave secreta
    });

    return {
      secret: secret.base32,
      otpauthUrl: secret.otpauth_url,
    };
  },

  /**
   * @function verifyToken
   * @description Verifica el código TOTP proporcionado por el usuario contra el secreto almacenado.
   * Utiliza una ventana de tiempo para tolerar desincronizaciones menores.
   * @param {string} secret - La clave secreta Base32 almacenada en la DB.
   * @param {string} token - El código de 6 dígitos introducido por el usuario.
   * @returns {boolean} True si el código es válido.
   */
  verifyToken(secret, token) {
    return speakeasy.totp.verify({
      secret: secret,
      encoding: "base32",
      token: token,
      window: 1, // Permite 1 paso de tiempo antes o después (tolerancia de 30 segundos)
    });
  },

  /**
   * @async
   * @function enable2FA
   * @description Almacena la clave secreta y marca el 2FA como habilitado en la DB.
   * @param {number} userId - ID del usuario.
   * @param {string} secret - El secreto Base32 ya validado que debe almacenarse.
   * @throws {Error} Si el usuario no es encontrado.
   */
  async enable2FA(userId, secret) {
    const user = await Usuario.findByPk(userId);
    if (!user) {
      throw new Error("Usuario no encontrado.");
    }

    await user.update({
      is_2fa_enabled: true,
      twofa_secret: secret, // Almacena el secreto Base32
    });
  },

  /**
   * @async
   * @function disable2FA
   * @description Proceso seguro para deshabilitar el 2FA:
   * 1. Verifica la contraseña actual del usuario.
   * 2. Verifica el código TOTP actual.
   * 3. Si ambos son correctos, deshabilita y elimina el secreto 2FA.
   * @param {number} userId - ID del usuario.
   * @param {string} currentPassword - Contraseña actual del usuario (sin hash).
   * @param {string} totpCode - El código de 6 dígitos introducido por el usuario.
   * @returns {Promise<boolean>} True si el 2FA fue deshabilitado exitosamente.
   * @throws {Error} Si el usuario no existe, si la contraseña o el código 2FA son incorrectos.
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
      twofa_secret: null, // CRÍTICO: Eliminar el secreto para invalidar futuros códigos
    });

    return true;
  },
};

module.exports = auth2faService;
