const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const contratoController = require("../controllers/contrato.controller");
const authMiddleware = require("../middleware/auth.middleware");

// Configuración de Multer (Mantenida)
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/");
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + "-" + file.originalname.replace(/ /g, "_"));
  },
});
const upload = multer({ storage: storage });

// ===============================================
// 1. RUTAS ESTÁTICAS Y CON PREFIJO (TODAS)
// ===============================================

// Rutas POST (Estáticas y Semi-Dinámicas)
router.post(
  "/upload",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  upload.single("contrato"),
  contratoController.upload
);

router.post(
  "/firmar",
  authMiddleware.authenticate,
  upload.single("contrato_firmado"),
  contratoController.sign
);

// Rutas GET Estáticas y con Prefijo Fijo (¡CRÍTICO!)

// Ruta protegida para administradores: Ver TODOS los contratos (GET estático)
router.get(
  "/",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  contratoController.findAll
);

// **NUEVA RUTA**: Ver sus propios contratos (Estática con prefijo, ¡va antes de /:id!)
router.get(
  "/mis_contratos",
  authMiddleware.authenticate,
  contratoController.findMyContracts
);

// 🚨 NUEVA RUTA DE DESCARGA SEGURA (Dinámica con prefijo fijo, ¡va antes de /:id!)
router.get(
  "/descargar/:id",
  authMiddleware.authenticate,
  contratoController.download
);

// ===============================================
// 2. RUTAS DINÁMICAS GENÉRICAS (DEBEN IR AL FINAL)
// ===============================================

// Ruta protegida: Solo usuarios autenticados pueden obtener un contrato específico por ID
// ⚠️ ESTA DEBE IR AL FINAL DE TODOS LOS GET
router.get("/:id", authMiddleware.authenticate, contratoController.findById);

module.exports = router;
