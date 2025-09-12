// routes/proyecto.routes.js

const express = require('express');
const router = express.Router();
const proyectoController = require('../controllers/proyecto.controller');

// Definir las rutas de la API y conectarlas al controlador
router.post('/', proyectoController.create);
router.get('/', proyectoController.findAll); // Para administradores
router.get('/activos', proyectoController.findAllActivo); // Para clientes
router.get('/:id', proyectoController.findById);
router.put('/:id', proyectoController.update);
router.delete('/:id', proyectoController.softDelete);

module.exports = router;