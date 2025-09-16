const express = require('express');
const router = express.Router();
const pujaController = require('../controllers/puja.controller');
const authMiddleware = require('../middleware/auth.middleware');

// Ruta protegida: Solo usuarios autenticados pueden crear una puja
router.post('/', authMiddleware.authenticate, pujaController.create);

// Ruta protegida para administradores: Solo los administradores pueden ver TODAS las pujas
router.get('/', authMiddleware.authenticate, authMiddleware.authorizeAdmin, pujaController.findAll);

// Ruta protegida: Solo usuarios autenticados pueden ver las pujas activas
router.get('/activas', authMiddleware.authenticate, pujaController.findAllActivo);

// **NUEVA RUTA**: Solo un usuario autenticado puede ver sus propias pujas
router.get('/mis_pujas', authMiddleware.authenticate, pujaController.findMyPujas);

// Ruta protegida: Solo usuarios autenticados pueden ver una puja específica
router.get('/:id', authMiddleware.authenticate, pujaController.findById);

// Rutas protegidas para administradores: Solo los administradores pueden actualizar o "eliminar" pujas
router.put('/:id', authMiddleware.authenticate, authMiddleware.authorizeAdmin, pujaController.update);
router.delete('/:id', authMiddleware.authenticate, authMiddleware.authorizeAdmin, pujaController.softDelete);

module.exports = router;