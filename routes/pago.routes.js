const express = require('express');
const router = express.Router();
const pagoController = require('../controllers/pago.controller');
const authMiddleware = require('../middleware/auth.middleware');

// **NUEVA RUTA**: Permite crear un nuevo pago
router.post('/', authMiddleware.authenticate, pagoController.create);

// Rutas protegidas para administradores: Solo los administradores pueden ver todos los pagos
router.get('/', authMiddleware.authenticate, authMiddleware.authorizeAdmin, pagoController.findAll);

// Rutas de usuario: La ruta específica de 'mis_pagos' va primero
router.get('/mis_pagos', authMiddleware.authenticate, pagoController.findMyPayments);

// Rutas protegidas para administradores: Las rutas genéricas con parámetros van después
router.get('/:id', authMiddleware.authenticate, authMiddleware.authorizeAdmin, pagoController.findById);

// Rutas protegidas para administradores: Solo los administradores pueden confirmar un pago
router.put('/confirmar/:id', authMiddleware.authenticate, authMiddleware.authorizeAdmin, pagoController.confirmPayment);

// Rutas protegidas para administradores: Solo los administradores pueden actualizar o "eliminar" un pago
router.put('/:id', authMiddleware.authenticate, authMiddleware.authorizeAdmin, pagoController.update);
router.delete('/:id', authMiddleware.authenticate, authMiddleware.authorizeAdmin, pagoController.softDelete);

// **NUEVA RUTA PARA PRUEBA MANUAL**: Llama a la función que crea un pago
router.post('/trigger-manual-payment', authMiddleware.authenticate, authMiddleware.authorizeAdmin, pagoController.triggerManualPayment);

module.exports = router;