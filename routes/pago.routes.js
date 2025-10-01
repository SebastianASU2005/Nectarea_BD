const express = require('express');
const router = express.Router();
const pagoController = require('../controllers/pago.controller');
const authMiddleware = require('../middleware/auth.middleware');

// =================================================================
// RUTAS GENERALES
// =================================================================

// [POST /] Permite crear un nuevo pago inicial.
router.post('/', authMiddleware.authenticate, pagoController.create);

// [GET /mis_pagos] Permite que un usuario autenticado vea solo sus pagos.
router.get('/mis_pagos', authMiddleware.authenticate, pagoController.findMyPayments);

// [POST /pagar-mes/:id] **NUEVO FLUJO DE PAGO**: Permite que un usuario procese
// un pago pendiente o vencido (crea la Transacción asociada).
router.post('/pagar-mes/:id', authMiddleware.authenticate, pagoController.processPayment);

// =================================================================
// RUTAS PROTEGIDAS (Solo Administradores)
// =================================================================

// [GET /] Obtiene todos los pagos.
router.get('/', authMiddleware.authenticate, authMiddleware.authorizeAdmin, pagoController.findAll);

// [GET /:id] Obtiene un pago específico por ID.
router.get('/:id', authMiddleware.authenticate, authMiddleware.authorizeAdmin, pagoController.findById);

// [PUT /:id] Actualiza un pago.
router.put('/:id', authMiddleware.authenticate, authMiddleware.authorizeAdmin, pagoController.update);

// [DELETE /:id] "Elimina" un pago (soft delete).
router.delete('/:id', authMiddleware.authenticate, authMiddleware.authorizeAdmin, pagoController.softDelete);

// =================================================================
// RUTA DE PRUEBA MANUAL (Solo Administradores)
// =================================================================

// [POST /trigger-manual-payment] Genera un pago mensual a una suscripción específica
router.post('/trigger-manual-payment', authMiddleware.authenticate, authMiddleware.authorizeAdmin, pagoController.triggerManualPayment);

module.exports = router;
