// routes/contratoRoutes.js

const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/auth.middleware");
const checkKYCandTwoFA = require("../middleware/checkKYCandTwoFA");
const { blockAdminTransactions } = require("../middleware/roleValidation");

const contratoPlantillaController = require("../controllers/contratoPlantilla.controller");
const contratoFirmaController = require("../controllers/contratoFirmado.controller");
const contratoGeneralController = require("../controllers/contratoGeneral.controller");

const {
  uploadSignedContract,
  uploadPlantilla,
} = require("../middleware/imageUpload.middleware");

// ===============================================
// 1. RUTAS DE GESTIÓN DE PLANTILLAS (ADMINISTRACIÓN)
// ===============================================

// 🆕 Crear nueva plantilla
router.post(
  "/plantillas/upload",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  uploadPlantilla,
  contratoPlantillaController.createPlantilla,
);

// 🆕 Actualizar datos de plantilla (nombre, proyecto, versión) - SIN modificar PDF
router.put(
  "/plantillas/:id",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  contratoPlantillaController.updatePlantillaData,
);

// Actualizar archivo PDF de plantilla
router.post(
  "/plantillas/update-pdf/:id",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  uploadPlantilla,
  contratoPlantillaController.updatePlantillaPdf,
);

// 🆕 Activar/Desactivar plantilla (toggle)
router.put(
  "/plantillas/toggle-active/:id",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  contratoPlantillaController.toggleActivePlantilla,
);

// Borrado lógico (soft delete)
router.put(
  "/plantillas/soft-delete/:id",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  contratoPlantillaController.softDeletePlantilla,
);

// Listar TODAS las plantillas (activas e inactivas)
router.get(
  "/plantillas/all",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  contratoPlantillaController.findAllPlantillas,
);

// 🆕 Listar solo plantillas ACTIVAS
router.get(
  "/plantillas/active",
  authMiddleware.authenticate,
  contratoPlantillaController.findAllActivePlantillas,
);

// Listar plantillas sin proyecto asignado
router.get(
  "/plantillas/unassociated",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  contratoPlantillaController.findUnassociatedPlantillas,
);

// Obtener plantilla específica por proyecto y versión (con verificación de integridad)
router.get(
  "/plantilla/:idProyecto/:version",
  authMiddleware.authenticate,
  contratoPlantillaController.getPlantillaByProjectVersion,
);

// Listar plantillas de un proyecto específico
router.get(
  "/plantillas/project/:idProyecto",
  authMiddleware.authenticate,
  contratoPlantillaController.findPlantillasByProject,
);

// Alias para compatibilidad
router.get(
  "/plantillas/:idProyecto",
  authMiddleware.authenticate,
  contratoPlantillaController.getAllPlantillasByProject,
);

// ===============================================
// 2. RUTAS DE PROCESO DE FIRMA (ContratoFirmado)
// ===============================================

// POST /api/contratos/firmar
// 🔒 OPERACIÓN CRÍTICA: Requiere KYC + 2FA + NO ser admin
router.post(
  "/firmar",
  authMiddleware.authenticate,
  blockAdminTransactions,
  checkKYCandTwoFA,
  uploadSignedContract,
  contratoFirmaController.registrarFirma,
);

// ===============================================
// 3. RUTAS DE GESTIÓN DE CONTRATOS FIRMADOS
// ===============================================

router.get(
  "/",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  contratoGeneralController.findAllSigned,
);

router.get(
  "/mis_contratos",
  authMiddleware.authenticate,
  contratoGeneralController.findMyContracts,
);
router.get(
  "/track/:projectId",
  authMiddleware.authenticate,
  contratoFirmaController.trackPaymentAndContract, 
);

// GET /descargar/:idContratoFirmado
// 🔒 DESCARGA SEGURA: Requiere KYC + 2FA (admins SÍ pueden descargar para auditoría)
router.get(
  "/descargar/:idContratoFirmado",
  authMiddleware.authenticate,
  checkKYCandTwoFA,
  contratoGeneralController.download,
);

// ===============================================
// 4. RUTAS DINÁMICAS GENÉRICAS (Van al final)
// ===============================================

router.get(
  "/:id",
  authMiddleware.authenticate,
  contratoGeneralController.findById,
);

module.exports = router;
