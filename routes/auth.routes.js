// Archivo: routes/auth.routes.js (MODIFICADO)

const express = require("express");
const router = express.Router();
const authController = require("../controllers/auth.controller");
const authMiddleware = require("../middleware/auth.middleware");
const auth2faController = require("../controllers/auth2fa.controller");

// 🚨 1. IMPORTAR LOS MIDDLEWARES DE LIMITACIÓN DE TASA 🚨
const { loginLimiter, fa2Limiter } = require("../middleware/rateLimiter");

// --- RUTAS PÚBLICAS (No requieren autenticación) ---

// 1. Registro de nuevos usuarios
router.post("/register", loginLimiter, authController.register); // ⬅️ Limitado: Previene la creación masiva de cuentas (spam)

// 2. Inicio de sesión (Paso 1: verifica credenciales)
router.post("/login", loginLimiter, authController.login); // ⬅️ Limitado: CRÍTICO para prevenir fuerza bruta de contraseñas

// 🚀 3. Verificación del Código 2FA (Paso 2 del Login)
router.post("/2fa/verify", fa2Limiter, authController.verify2FA); // ⬅️ Limitador Estricto: CRÍTICO para prevenir fuerza bruta de códigos TOTP

// 4. Confirmación de correo electrónico (GET, bajo riesgo)
router.get("/confirmar_email/:token", authController.confirmarEmail);

// 5. Reenvío de confirmación
router.post(
  "/reenviar_confirmacion",
  loginLimiter,
  authController.resendConfirmation
); // ⬅️ Limitado: Previene el spam de correos electrónicos

// --- RUTAS PROTEGIDAS (Requieren JWT de sesión normal) ---

// 6. Solicitud de restablecimiento (envío del email)
router.post("/forgot-password", loginLimiter, authController.forgotPassword); // ⬅️ Limitado: Previene la enumeración de usuarios y spam de correos

// 7. Aplicar la nueva contraseña con el token
router.post("/reset-password/:token", fa2Limiter, authController.resetPassword); // ⬅️ Limitador Estricto: Previene la fuerza bruta del token de restablecimiento

// 8. Desactivar 2FA (Ya protegido por authMiddleware.authenticate)
router.post(
  "/2fa/disable",
  authMiddleware.authenticate,
  auth2faController.disable2FA
);

// 9. Logout (Ya protegido por authMiddleware.authenticate)
router.post("/logout", authMiddleware.authenticate, authController.logout);

// 10. Generar el secreto 2FA (Ya protegido por authMiddleware.authenticate)
router.post(
  "/2fa/generate-secret",
  authMiddleware.authenticate,
  auth2faController.generate2FASecret
);

// 11. Verificar y HABILITAR 2FA (Ya protegido por authMiddleware.authenticate)
router.post(
  "/2fa/enable",
  authMiddleware.authenticate,
  auth2faController.verifyAndEnable2FA
);

module.exports = router;
