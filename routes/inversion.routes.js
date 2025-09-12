// routes/inversion.routes.js

const express = require('express');
const router = express.Router();
const inversionController = require('../controllers/inversion.controller');

// Definir las rutas de la API y conectarlas al controlador
router.post('/', inversionController.create);
router.get('/', inversionController.findAll); // Para administradores
router.get('/activas', inversionController.findAllActivo); // ¡Nueva ruta para clientes!
router.get('/:id', inversionController.findById);
router.put('/:id', inversionController.update);
router.delete('/:id', inversionController.softDelete);

module.exports = router;