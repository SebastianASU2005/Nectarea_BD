const express = require("express");
const router = express.Router();
const verificacionIdentidadController = require("../controllers/verificacionIdentidad.controller");
const authMiddleware = require("../middleware/auth.middleware");
const { uploadKYCData } = require("../middleware/imageUpload.middleware");

// =================================================================
// RUTAS DE USUARIO (Verificación de Identidad)
// =================================================================

router.post(
  "/submit",
  authMiddleware.authenticate,
  uploadKYCData,
  verificacionIdentidadController.submitVerificationData,
);

router.get(
  "/status",
  authMiddleware.authenticate,
  verificacionIdentidadController.getVerificationStatus,
);

// =================================================================
// RUTAS DE ADMINISTRADOR (Gestión de Verificaciones)
// =================================================================

router.get(
  "/pending",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  verificacionIdentidadController.getPendingVerifications,
);

router.get(
  "/approved",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  verificacionIdentidadController.getApprovedVerifications,
);

router.get(
  "/rejected",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  verificacionIdentidadController.getRejectedVerifications,
);

router.get(
  "/all",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  verificacionIdentidadController.getAllProcessedVerifications,
);

router.post(
  "/approve/:idUsuario",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  verificacionIdentidadController.approveVerification,
);

router.post(
  "/reject/:idUsuario",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  verificacionIdentidadController.rejectVerification,
);

module.exports = router;
