// routes/contratoRoutes.js

const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/auth.middleware");
const checkKYCandTwoFA = require("../middleware/checkKYCandTwoFA");
const { blockAdminTransactions } = require("../middleware/roleValidation"); // ✅ NUEVO

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

router.post(
  "/plantillas/upload",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  uploadPlantilla,
  contratoPlantillaController.createPlantilla
);

router.post(
  "/plantillas/update-pdf/:id",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  uploadPlantilla,
  contratoPlantillaController.updatePlantillaPdf
);

router.put(
  "/plantillas/soft-delete/:id",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  contratoPlantillaController.softDeletePlantilla
);

router.get(
  "/plantillas/all",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  contratoPlantillaController.findAllPlantillas
);

router.get(
  "/plantillas/unassociated",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  contratoPlantillaController.findUnassociatedPlantillas
);

router.get(
  "/plantilla/:idProyecto/:version",
  authMiddleware.authenticate,
  contratoPlantillaController.getPlantillaByProjectVersion
);

router.get(
  "/plantillas/project/:idProyecto",
  authMiddleware.authenticate,
  contratoPlantillaController.findPlantillasByProject
);

router.get(
  "/plantillas/:idProyecto",
  authMiddleware.authenticate,
  contratoPlantillaController.getAllPlantillasByProject
);

// ===============================================
// 2. RUTAS DE PROCESO DE FIRMA (ContratoFirmado)
// ===============================================

// POST /api/contratos/firmar
// 🔒 OPERACIÓN CRÍTICA: Requiere KYC + 2FA + NO ser admin
router.post(
  "/firmar",
  authMiddleware.authenticate,
  blockAdminTransactions, // ✅ NUEVO: Bloquea admins
  checkKYCandTwoFA,
  uploadSignedContract,
  contratoFirmaController.registrarFirma
);

// ===============================================
// 3. RUTAS DE GESTIÓN DE CONTRATOS FIRMADOS
// ===============================================

router.get(
  "/",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  contratoGeneralController.findAllSigned
);

router.get(
  "/mis_contratos",
  authMiddleware.authenticate,
  contratoGeneralController.findMyContracts
);

// GET /descargar/:idContratoFirmado
// 🔒 DESCARGA SEGURA: Requiere KYC + 2FA (admins SÍ pueden descargar para auditoría)
router.get(
  "/descargar/:idContratoFirmado",
  authMiddleware.authenticate,
  checkKYCandTwoFA,
  contratoGeneralController.download
);

// ===============================================
// 4. RUTAS DINÁMICAS GENÉRICAS (Van al final)
// ===============================================

router.get(
  "/:id",
  authMiddleware.authenticate,
  contratoGeneralController.findById
);

module.exports = router;