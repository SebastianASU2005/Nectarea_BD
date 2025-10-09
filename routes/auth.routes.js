// Archivo: routes/auth.routes.js (Ejemplo)

const express = require("express");
const router = express.Router();
const authController = require("../controllers/auth.controller");
// 🛑 1. IMPORTAR MIDDLEWARE Y CONTROLADOR 2FA 🛑
const authMiddleware = require("../middleware/auth.middleware");
const auth2faController = require("../controllers/auth2fa.controller");

// --- RUTAS PÚBLICAS (No requieren autenticación) ---

// 1. Registro de nuevos usuarios
router.post("/register", authController.register);

// 2. Inicio de sesión (Paso 1: verifica credenciales. Devuelve JWT de sesión O twoFaToken)
router.post("/login", authController.login);

// 🚀 3. NUEVA RUTA: Verificación del Código 2FA (Paso 2 del Login) 🚀
router.post("/2fa/verify", authController.verify2FA);

// 4. Confirmación de correo electrónico
router.get("/confirmar_email/:token", authController.confirmarEmail);
router.post("/reenviar_confirmacion", authController.resendConfirmation);

// --- RUTAS PROTEGIDAS (Requieren JWT de sesión normal) ---
// 🚀 RUTAS DE RECUPERACIÓN DE CONTRASEÑA 🚀

// 6. Solicitud de restablecimiento (envío del email)
router.post("/forgot-password", authController.forgotPassword);

// 7. Aplicar la nueva contraseña con el token
router.post("/reset-password/:token", authController.resetPassword);
// 🚀 RUTA PARA DESACTIVAR 2FA 🚀
router.post(
  "/2fa/disable",
  authMiddleware.authenticate, // Requiere que el usuario esté logueado
  auth2faController.disable2FA
);

// 🚀 5. NUEVAS RUTAS: Configuración de 2FA 🚀
router.post(
  "/logout",
  authMiddleware.authenticate, // Requiere que el usuario tenga un token válido para cerrar sesión
  authController.logout
);

// Generar el secreto 2FA (QR Code URL)
router.post(
  "/2fa/generate-secret",
  authMiddleware.authenticate, // Requiere que el usuario esté logueado
  auth2faController.generate2FASecret
);

// Verificar el código 2FA y HABILITAR permanentemente
router.post(
  "/2fa/enable",
  authMiddleware.authenticate, // Requiere que el usuario esté logueado
  auth2faController.verifyAndEnable2FA
);

module.exports = router;
