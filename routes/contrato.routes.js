const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const contratoController = require("../controllers/contrato.controller");
const authMiddleware = require("../middleware/auth.middleware");

// Configuración de Multer para subir archivos a la carpeta 'uploads'
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/");
  },
  filename: function (req, file, cb) {
    // Aseguramos que el nombre del archivo incluya un timestamp para evitar colisiones
    cb(null, Date.now() + "-" + file.originalname.replace(/ /g, "_"));
  },
});
const upload = multer({ storage: storage });

// Ruta protegida para administradores: Subir Contrato BASE
router.post(
  "/upload",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  upload.single("contrato"), // El nombre del campo del archivo es 'contrato'
  contratoController.upload
);

// Ruta protegida para FIRMA
router.post(
  "/firmar",
  authMiddleware.authenticate,
  upload.single("contrato_firmado"), // El nombre del campo del archivo es 'contrato_firmado'
  contratoController.sign
);

// **NUEVA RUTA**: Solo un usuario autenticado puede ver sus propios contratos
router.get(
  "/mis_contratos",
  authMiddleware.authenticate,
  contratoController.findMyContracts
);

// 🚨 NUEVA RUTA DE DESCARGA SEGURA
// Solo usuarios autenticados pueden descargar un contrato por ID si tienen autorización
router.get(
  "/descargar/:id",
  authMiddleware.authenticate,
  contratoController.download
);

// Ruta protegida para administradores: Solo los administradores pueden ver TODOS los contratos
router.get(
  "/",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  contratoController.findAll
);

// Ruta protegida: Solo usuarios autenticados pueden obtener un contrato específico por ID
router.get("/:id", authMiddleware.authenticate, contratoController.findById);

module.exports = router;
