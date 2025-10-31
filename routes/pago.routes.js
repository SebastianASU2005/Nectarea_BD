const express = require("express");
const router = express.Router();
const pagoController = require("../controllers/pago.controller");
const authMiddleware = require("../middleware/auth.middleware");

// =================================================================
// 1. RUTAS ESTÁTICAS Y SEMI-DINÁMICAS (USUARIO y ADMIN)
// Estas van ANTES de cualquier /:id genérico.
// =================================================================

// [GET /mis_pagos] Permite que un usuario autenticado vea solo sus pagos.
router.get(
  "/mis_pagos",
  authMiddleware.authenticate,
  pagoController.findMyPayments
);

// [POST /confirmar-pago-2fa] Va antes de cualquier POST dinámico.
router.post(
  "/confirmar-pago-2fa",
  authMiddleware.authenticate,
  pagoController.confirmarPagoYContinuar
);

// Rutas de Administración (Estáticas)
// [GET /metricas/mensuales?mes=X&anio=Y] Obtiene Recaudo, Vencidos y Tasa de Morosidad (Admin)
router.get(
  "/metricas/mensuales",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  pagoController.getMonthlyMetrics
);

// [GET /metricas/a-tiempo?mes=X&anio=Y] Obtiene Tasa de Pagos a Tiempo (Admin)
router.get(
  "/metricas/a-tiempo",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  pagoController.getOnTimeRate
);
// [GET /] Obtiene todos los pagos (Admin).
router.get(
  "/",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  pagoController.findAll
);

// [POST /trigger-manual-payment] Ruta de Prueba/Manual (Admin, estática)
router.post(
  "/trigger-manual-payment",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  pagoController.triggerManualPayment
);

// =================================================================
// 2. RUTAS DINÁMICAS CON PREFIJO (Semi-Dinámicas)
// =================================================================

// [POST /pagar-mes/:id] **NUEVO FLUJO DE PAGO**: Tiene un prefijo fijo, va aquí.
router.post(
  "/pagar-mes/:id",
  authMiddleware.authenticate,
  pagoController.requestCheckout
);

// =================================================================
// 3. RUTAS DINÁMICAS GENÉRICAS (ADMIN)
// Estas DEBEN ir al final.
// =================================================================

// [GET /:id] Obtiene un pago específico por ID.
router.get(
  "/:id",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  pagoController.findById
);

// [PUT /:id] Actualiza un pago.
router.put(
  "/:id",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  pagoController.update
);

// [DELETE /:id] "Elimina" un pago (soft delete).
router.delete(
  "/:id",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  pagoController.softDelete
);

module.exports = router;
