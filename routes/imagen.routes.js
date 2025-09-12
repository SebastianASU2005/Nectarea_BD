// routes/imagen.routes.js

const express = require('express');
const router = express.Router();
const imagenController = require('../controllers/imagen.controller');

// Definir las rutas de la API y conectarlas al controlador
router.post('/', imagenController.create);
router.get('/', imagenController.findAll); // Para administradores
router.get('/activas', imagenController.findAllActivo); // Para clientes
router.get('/:id', imagenController.findById);
router.put('/:id', imagenController.update);
router.delete('/:id', imagenController.softDelete); // Usamos 'softDelete' aquí

module.exports = router;