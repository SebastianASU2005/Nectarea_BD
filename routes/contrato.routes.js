const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const contratoController = require('../controllers/contrato.controller');

// Configuración de Multer para subir archivos a la carpeta 'uploads'
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  }
});
const upload = multer({ storage: storage });

// Ruta para subir un nuevo contrato (con un archivo PDF)
router.post('/upload', upload.single('contrato'), contratoController.upload);

// Ruta para agregar la firma digital a un contrato existente
router.put('/:id/firmar', contratoController.sign);

// **NUEVA RUTA (MOVIDA)** - Ruta para obtener todos los contratos activos
router.get('/activos', contratoController.findAllActivo);

// **NUEVA RUTA (MOVIDA)** - Ruta para obtener todos los contratos (activos e inactivos)
router.get('/', contratoController.findAll);

// Ruta para obtener un contrato por su ID. DEBE IR AL FINAL
router.get('/:id', contratoController.findById);

module.exports = router;