const express = require('express');
const router = express.Router();
const imagenController = require('../controllers/imagen.controller');
const authMiddleware = require('../middleware/auth.middleware');

// Ruta protegida: Solo usuarios autenticados pueden crear una imagen
router.post('/', authMiddleware.authenticate,authMiddleware.authorizeAdmin, imagenController.create);

// Ruta protegida para administradores: Solo los administradores pueden ver TODAS las imágenes (activas e inactivas)
router.get('/', authMiddleware.authenticate, authMiddleware.authorizeAdmin, imagenController.findAll);

// Ruta protegida: Solo usuarios autenticados pueden ver imágenes activas
router.get('/activas', authMiddleware.authenticate, imagenController.findAllActivo);

// Ruta protegida: Solo usuarios autenticados pueden ver una imagen específica
router.get('/:id', authMiddleware.authenticate, imagenController.findById);

// Rutas protegidas para administradores: Solo los administradores pueden actualizar o "eliminar" imágenes
router.put('/:id', authMiddleware.authenticate, authMiddleware.authorizeAdmin, imagenController.update);
router.delete('/:id', authMiddleware.authenticate, authMiddleware.authorizeAdmin, imagenController.softDelete);

module.exports = router;