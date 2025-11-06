// routes/contratoRoutes.js

const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/auth.middleware");
const checkKYCandTwoFA = require("../middleware/checkKYCandTwoFA"); // 🔒 NUEVO

// --- Controladores ---
const contratoPlantillaController = require("../controllers/contratoPlantilla.controller");
const contratoFirmaController = require("../controllers/contratoFirmado.controller");
const contratoGeneralController = require("../controllers/contratoGeneral.controller");

// --- Middlewares ---
const {
  uploadSignedContract,
  uploadPlantilla,
} = require("../middleware/imageUpload.middleware");

// ===============================================
// 1. RUTAS DE GESTIÓN DE PLANTILLAS (ADMINISTRACIÓN)
// ===============================================

// POST /api/contratos/plantillas/upload
// Sube un nuevo archivo PDF y crea una nueva Plantilla (Solo Admin)
router.post(
  "/plantillas/upload",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  uploadPlantilla,
  contratoPlantillaController.createPlantilla
);

// POST /api/contratos/plantillas/update-pdf/:id
// Actualiza el archivo PDF de una plantilla existente (Solo Admin)
router.post(
  "/plantillas/update-pdf/:id",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  uploadPlantilla,
  contratoPlantillaController.updatePlantillaPdf
);

// PUT /api/contratos/plantillas/soft-delete/:id
// Borrado lógico de una plantilla (Solo Admin)
router.put(
  "/plantillas/soft-delete/:id",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  contratoPlantillaController.softDeletePlantilla
);

// GET /api/contratos/plantillas/all
// Lista TODAS las plantillas (activas e inactivas) (Solo Admin)
router.get(
  "/plantillas/all",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  contratoPlantillaController.findAllPlantillas
);

// GET /api/contratos/plantillas/unassociated
// Lista plantillas activas sin proyecto asignado (Solo Admin)
router.get(
  "/plantillas/unassociated",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  contratoPlantillaController.findUnassociatedPlantillas
);

// GET /api/contratos/plantilla/:idProyecto/:version
// Obtener una plantilla específica con verificación de integridad (Usuario/Admin)
router.get(
  "/plantilla/:idProyecto/:version",
  authMiddleware.authenticate,
  contratoPlantillaController.getPlantillaByProjectVersion
);

// GET /api/contratos/plantillas/project/:idProyecto
// Lista todas las versiones de plantillas para un proyecto (Usuario/Admin)
router.get(
  "/plantillas/project/:idProyecto",
  authMiddleware.authenticate,
  contratoPlantillaController.findPlantillasByProject
);

// GET /api/contratos/plantillas/:idProyecto (Por compatibilidad)
router.get(
  "/plantillas/:idProyecto",
  authMiddleware.authenticate,
  contratoPlantillaController.getAllPlantillasByProject
);

// ===============================================
// 2. RUTAS DE PROCESO DE FIRMA (ContratoFirmado)
// ===============================================

// POST /api/contratos/firmar
// 🔒 OPERACIÓN CRÍTICA: Requiere KYC aprobado + 2FA activo
router.post(
  "/firmar",
  authMiddleware.authenticate,
  checkKYCandTwoFA, // 🚨 MIDDLEWARE DE SEGURIDAD OBLIGATORIO
  uploadSignedContract,
  contratoFirmaController.registrarFirma
);

// ===============================================
// 3. RUTAS DE GESTIÓN DE CONTRATOS FIRMADOS (Generales)
// ===============================================

// GET /api/contratos/
// Ver TODOS los contratos firmados (Solo Admin)
router.get(
  "/",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  contratoGeneralController.findAllSigned
);

// GET /api/contratos/mis_contratos
// Ver sus propios contratos firmados
router.get(
  "/mis_contratos",
  authMiddleware.authenticate,
  contratoGeneralController.findMyContracts
);

// GET /api/contratos/descargar/:idContratoFirmado
// 🔒 DESCARGA SEGURA: Requiere KYC + 2FA para descargar contratos
router.get(
  "/descargar/:idContratoFirmado",
  authMiddleware.authenticate,
  checkKYCandTwoFA, // 🚨 PROTECCIÓN ADICIONAL
  contratoGeneralController.download
);

// ===============================================
// 4. RUTAS DINÁMICAS GENÉRICAS (DEBEN IR AL FINAL)
// ===============================================

// GET /api/contratos/:id
// Obtener un registro de ContratoFirmado específico por ID
router.get(
  "/:id",
  authMiddleware.authenticate,
  contratoGeneralController.findById
);

module.exports = router;
