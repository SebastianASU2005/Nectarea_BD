// routes/lote.routes.js

const express = require('express');
const router = express.Router();
const loteController = require('../controllers/lote.controller');

// Definir las rutas de la API y conectarlas al controlador
router.post('/', loteController.create);
router.get('/', loteController.findAll); // Para administradores
router.get('/activos', loteController.findAllActivo); // Para clientes
router.get('/:id', loteController.findById);
router.put('/:id', loteController.update);
router.delete('/:id', loteController.softDelete); // Usamos 'softDelete' aquí

module.exports = router;