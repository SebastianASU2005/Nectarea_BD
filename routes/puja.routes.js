// routes/puja.routes.js

const express = require('express');
const router = express.Router();
const pujaController = require('../controllers/puja.controller');

// Definir las rutas de la API y conectarlas al controlador
router.post('/', pujaController.create);
router.get('/', pujaController.findAll); // Para administradores
router.get('/activas', pujaController.findAllActivo); // Para clientes
router.get('/:id', pujaController.findById);
router.put('/:id', pujaController.update);
router.delete('/:id', pujaController.softDelete); // Usamos 'softDelete' aquí

module.exports = router;