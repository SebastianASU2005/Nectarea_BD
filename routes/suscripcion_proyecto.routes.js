const express = require('express');
const router = express.Router();
const suscripcionProyectoController = require('../controllers/suscripcion_proyecto.controller');
const authMiddleware = require('../middleware/auth.middleware');

// Ruta protegida: Solo usuarios autenticados pueden crear una suscripción
router.post('/', authMiddleware.authenticate, suscripcionProyectoController.create);

// Ruta protegida para administradores: Solo los administradores pueden ver TODAS las suscripciones
router.get('/', authMiddleware.authenticate, authMiddleware.authorizeAdmin, suscripcionProyectoController.findAll);

// Ruta protegida: Solo usuarios autenticados pueden ver las suscripciones activas
router.get('/activas', authMiddleware.authenticate, suscripcionProyectoController.findAllActivo);

// **NUEVA RUTA**: Solo un usuario autenticado puede ver sus propias suscripciones
router.get('/mis_suscripciones', authMiddleware.authenticate, suscripcionProyectoController.findMySubscriptions);

// Ruta protegida: Solo usuarios autenticados pueden ver una suscripción específica
router.get('/:id', authMiddleware.authenticate, suscripcionProyectoController.findById);

// Ruta protegida para administradores: Solo los administradores pueden "eliminar" una suscripción
router.delete('/:id', authMiddleware.authenticate, authMiddleware.authorizeAdmin, suscripcionProyectoController.softDelete);

module.exports = router;