// middlewares/checkKYCandTwoFA.js
const verificacionIdentidadService = require("../services/verificacionIdentidad.service");
const UsuarioService = require("../services/usuario.service");

/**
 * Middleware de seguridad que verifica:
 * 1. Que el usuario tenga KYC aprobado
 * 2. Que el usuario tenga 2FA activado
 *
 * Se aplica ANTES de cualquier operación sensible (pagos, inversiones, suscripciones, firmas).
 * Los administradores quedan exentos de estas verificaciones.
 */
const checkKYCandTwoFA = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.rol; // asumiendo que el token incluye 'rol'

    // 🚀 EXENCIÓN PARA ADMINISTRADORES (no requieren 2FA ni KYC)
    if (userRole === "admin") {
      return next();
    }

    // 1. Obtener datos del usuario (solo para no-admins)
    const user = await UsuarioService.findById(userId);

    if (!user) {
      return res.status(404).json({
        error: "Usuario no encontrado.",
      });
    }

    // 2. VERIFICACIÓN OBLIGATORIA: 2FA debe estar activo
    if (!user.is_2fa_enabled) {
      return res.status(403).json({
        error:
          "🔒 Seguridad requerida: Debes activar la autenticación de dos factores (2FA) para realizar esta operación.",
        action_required: "enable_2fa",
      });
    }

    // 3. VERIFICACIÓN OBLIGATORIA: KYC debe estar aprobado
    const verificacionKYC =
      await verificacionIdentidadService.getVerificationStatus(userId);

    if (
      !verificacionKYC ||
      verificacionKYC.estado_verificacion !== "APROBADA"
    ) {
      return res.status(403).json({
        error:
          "🔒 Seguridad requerida: Debes completar y aprobar la Verificación de Identidad (KYC) para realizar esta operación.",
        action_required: "complete_kyc",
        kyc_status: verificacionKYC
          ? verificacionKYC.estado_verificacion
          : "NO_INICIADO",
      });
    }

    // 4. Si todo está bien, continuar
    next();
  } catch (error) {
    console.error("Error en middleware checkKYCandTwoFA:", error);
    return res.status(500).json({
      error: "Error al verificar requisitos de seguridad.",
    });
  }
};

module.exports = checkKYCandTwoFA;
