const express = require('express');
const router = express.Router();
const pagoController = require('../controllers/pago.controller');
const authMiddleware = require('../middleware/auth.middleware');

// **NUEVA RUTA**: Permite crear un nuevo pago
router.post('/', authMiddleware.authenticate, pagoController.create);

// Rutas protegidas para administradores: Solo los administradores pueden ver todos los pagos
router.get('/', authMiddleware.authenticate, authMiddleware.authorizeAdmin, pagoController.findAll);

// Rutas protegidas para administradores: Solo los administradores pueden ver un pago por su ID
router.get('/:id', authMiddleware.authenticate, authMiddleware.authorizeAdmin, pagoController.findById);

// **NUEVA RUTA**: Un usuario autenticado puede ver sus propios pagos de forma segura
router.get('/mis_pagos', authMiddleware.authenticate, pagoController.findMyPayments);

// Rutas protegidas para administradores: Solo los administradores pueden confirmar un pago
router.put('/confirmar/:id', authMiddleware.authenticate, authMiddleware.authorizeAdmin, pagoController.confirmPayment);

// Rutas protegidas para administradores: Solo los administradores pueden actualizar o "eliminar" un pago
router.put('/:id', authMiddleware.authenticate, authMiddleware.authorizeAdmin, pagoController.update);
router.delete('/:id', authMiddleware.authenticate, authMiddleware.authorizeAdmin, pagoController.softDelete);

module.exports = router;