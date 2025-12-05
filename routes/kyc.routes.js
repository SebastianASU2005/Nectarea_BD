const express = require("express");
const router = express.Router();
const verificacionIdentidadController = require("../controllers/verificacionIdentidad.controller");
const authMiddleware = require("../middleware/auth.middleware");
const { uploadKYCData } = require("../middleware/imageUpload.middleware");

// =================================================================
// MIDDLEWARE DE DEBUG (TEMPORAL)
// =================================================================
router.use((req, res, next) => {
  console.log("\n🔍 ===== DENTRO DE KYC ROUTER =====");
  console.log("📍 Path:", req.path);
  console.log("📍 Method:", req.method);
  console.log("📍 Content-Type:", req.get("content-type"));
  next();
});

// =================================================================
// RUTAS DE USUARIO (Verificación de Identidad)
// =================================================================

// POST /submit
router.post(
  "/submit",
  (req, res, next) => {
    console.log("🎯 Entrando a ruta /submit");
    console.log("🎯 Antes de authenticate - Files:", !!req.files);
    next();
  },
  authMiddleware.authenticate,
  (req, res, next) => {
    console.log("🎯 Después de authenticate - Files:", !!req.files);
    console.log("🎯 Antes de uploadKYCData");
    next();
  },
  uploadKYCData, // 🚨 CRÍTICO: Multer debe ejecutarse aquí
  (req, res, next) => {
    console.log("🎯 Después de uploadKYCData - Files:", !!req.files);
    console.log(
      "🎯 Files keys:",
      req.files ? Object.keys(req.files) : "NO FILES"
    );
    next();
  },
  verificacionIdentidadController.submitVerificationData
);

// GET /status
router.get(
  "/status",
  authMiddleware.authenticate,
  verificacionIdentidadController.getVerificationStatus
);

// =================================================================
// RUTAS DE ADMINISTRADOR (Gestión de Verificaciones)
// =================================================================

// GET /pending - Lista verificaciones PENDIENTES
router.get(
  "/pending",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  verificacionIdentidadController.getPendingVerifications
);

// GET /approved - Lista verificaciones APROBADAS
router.get(
  "/approved",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  verificacionIdentidadController.getApprovedVerifications
);

// GET /rejected - Lista verificaciones RECHAZADAS
router.get(
  "/rejected",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  verificacionIdentidadController.getRejectedVerifications
);

// GET /all - Lista TODAS las verificaciones (aprobadas y rechazadas)
router.get(
  "/all",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  verificacionIdentidadController.getAllProcessedVerifications
);

// POST /approve/:idUsuario
router.post(
  "/approve/:idUsuario",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  verificacionIdentidadController.approveVerification
);

// POST /reject/:idUsuario
router.post(
  "/reject/:idUsuario",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  verificacionIdentidadController.rejectVerification
);

module.exports = router;
