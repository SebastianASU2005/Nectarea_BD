const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const contratoController = require('../controllers/contrato.controller');
const authMiddleware = require('../middleware/auth.middleware');

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

// Ruta protegida para administradores: Solo los administradores pueden subir un contrato
router.post('/upload', authMiddleware.authenticate, authMiddleware.authorizeAdmin, upload.single('contrato'), contratoController.upload);

// Ruta protegida: Solo usuarios autenticados pueden firmar un contrato
router.put('/:id/firmar', authMiddleware.authenticate, contratoController.sign);

// Ruta protegida: Solo usuarios autenticados pueden obtener contratos activos
router.get('/activos', authMiddleware.authenticate, contratoController.findAllActivo);

// **NUEVA RUTA**: Solo un usuario autenticado puede ver sus propios contratos
router.get('/mis_contratos', authMiddleware.authenticate, contratoController.findMyContracts);

// Ruta protegida para administradores: Solo los administradores pueden ver TODOS los contratos
router.get('/', authMiddleware.authenticate, authMiddleware.authorizeAdmin, contratoController.findAll);

// Ruta protegida: Solo usuarios autenticados pueden obtener un contrato específico por ID
router.get('/:id', authMiddleware.authenticate, contratoController.findById);

module.exports = router;