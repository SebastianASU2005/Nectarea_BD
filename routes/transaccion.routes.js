// routes/transaccion.routes.js

const express = require('express');
const router = express.Router();
const transaccionController = require('../controllers/transaccion.controller');

// Definir las rutas de la API y conectarlas al controlador
router.post('/', transaccionController.create);
router.get('/', transaccionController.findAll); // Para administradores
router.get('/activas', transaccionController.findAllActivo); // Para clientes
router.get('/:id', transaccionController.findById);
router.put('/:id', transaccionController.update);
router.delete('/:id', transaccionController.softDelete); // Usamos 'softDelete' aquí

module.exports = router;