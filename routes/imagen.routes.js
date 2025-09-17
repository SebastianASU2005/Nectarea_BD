const express = require('express');
const router = express.Router();
const imagenController = require('../controllers/imagen.controller');
const authMiddleware = require('../middleware/auth.middleware');

// Rutas para administradores
router.post('/', authMiddleware.authenticate, authMiddleware.authorizeAdmin, imagenController.create);
router.get('/', authMiddleware.authenticate, authMiddleware.authorizeAdmin, imagenController.findAll);
// Usa findById para que los administradores puedan ver imágenes eliminadas
router.get('/:id', authMiddleware.authenticate, authMiddleware.authorizeAdmin, imagenController.findById);
router.put('/:id', authMiddleware.authenticate, authMiddleware.authorizeAdmin, imagenController.update);
router.delete('/:id', authMiddleware.authenticate, authMiddleware.authorizeAdmin, imagenController.softDelete);

// Rutas para usuarios
router.get('/activas', authMiddleware.authenticate, imagenController.findAllActivo);
// Usa findByIdActivo para que los usuarios solo puedan ver imágenes activas
router.get('/:id', authMiddleware.authenticate, imagenController.findByIdActivo);

module.exports = router;