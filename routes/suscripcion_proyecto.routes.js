const express = require('express');
const router = express.Router();
const suscripcionProyectoController = require('../controllers/suscripcion_proyecto.controller');

// Ruta para crear una nueva suscripción
router.post('/', suscripcionProyectoController.create);

// Ruta para obtener todas las suscripciones
router.get('/', suscripcionProyectoController.findAll);

// Ruta para obtener todas las suscripciones activas
router.get('/activas', suscripcionProyectoController.findAllActivo);

// Ruta para obtener una suscripción específica por su ID
router.get('/:id', suscripcionProyectoController.findById);

// Ruta para eliminar (soft delete) una suscripción
router.delete('/:id', suscripcionProyectoController.softDelete);

module.exports = router;