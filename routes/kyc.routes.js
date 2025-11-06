// routes/kyc.routes.js

const express = require("express");
const router = express.Router();
const verificacionIdentidadController = require("../controllers/verificacionIdentidad.controller");
const authMiddleware = require("../middleware/auth.middleware");
const { uploadKYCData } = require("../middleware/imageUpload.middleware"); // Asume que tienes un middleware para archivos KYC

// =================================================================
// RUTAS DE USUARIO (Verificación de Identidad)
// =================================================================

// POST /submit
// Envía los documentos para verificación KYC
router.post(
  "/submit",
  authMiddleware.authenticate,
  uploadKYCData, // Middleware para manejar múltiples archivos
  verificacionIdentidadController.submitVerificationData
);

// GET /status
// Obtiene el estado de verificación del usuario actual
router.get(
  "/status",
  authMiddleware.authenticate,
  verificacionIdentidadController.getVerificationStatus
);

// =================================================================
// RUTAS DE ADMINISTRADOR (Gestión de Verificaciones)
// =================================================================

// GET /pending
// Lista todas las solicitudes pendientes de revisión
router.get(
  "/pending",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  verificacionIdentidadController.getPendingVerifications
);

// POST /approve/:idUsuario
// Aprueba la verificación de un usuario
router.post(
  "/approve/:idUsuario",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  verificacionIdentidadController.approveVerification
);

// POST /reject/:idUsuario
// Rechaza la verificación de un usuario (debes crear este controller)
router.post(
  "/reject/:idUsuario",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  verificacionIdentidadController.rejectVerification
);

module.exports = router;