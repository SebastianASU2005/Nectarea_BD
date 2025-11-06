// routes/pago.routes.js

const express = require("express");
const router = express.Router();
const pagoController = require("../controllers/pago.controller");
const authMiddleware = require("../middleware/auth.middleware");
const checkKYCandTwoFA = require("../middleware/checkKYCandTwoFA"); // 🔒 NUEVO

// =================================================================
// 1. RUTAS ESTÁTICAS Y SEMI-DINÁMICAS (USUARIO y ADMIN)
// =================================================================

// GET /mis_pagos
router.get(
  "/mis_pagos",
  authMiddleware.authenticate,
  pagoController.findMyPayments
);

// POST /confirmar-pago-2fa
// 🔒 OPERACIÓN CRÍTICA: Confirma pago con verificación 2FA
router.post(
  "/confirmar-pago-2fa",
  authMiddleware.authenticate,
  checkKYCandTwoFA, // 🚨 MIDDLEWARE DE SEGURIDAD OBLIGATORIO
  pagoController.confirmarPagoYContinuar
);

// GET /metricas/mensuales (Admin)
router.get(
  "/metricas/mensuales",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  pagoController.getMonthlyMetrics
);

// GET /metricas/a-tiempo (Admin)
router.get(
  "/metricas/a-tiempo",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  pagoController.getOnTimeRate
);

// GET /
router.get(
  "/",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  pagoController.findAll
);

// POST /trigger-manual-payment (Admin, prueba)
router.post(
  "/trigger-manual-payment",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  pagoController.triggerManualPayment
);

// =================================================================
// 2. RUTAS DINÁMICAS CON PREFIJO (Semi-Dinámicas)
// =================================================================

// POST /pagar-mes/:id
// 🔒 OPERACIÓN CRÍTICA: Inicia el pago de una mensualidad (requiere KYC + 2FA)
router.post(
  "/pagar-mes/:id",
  authMiddleware.authenticate,
  checkKYCandTwoFA, // 🚨 PROTECCIÓN DE PAGO
  pagoController.requestCheckout
);

// =================================================================
// 3. RUTAS DINÁMICAS GENÉRICAS (ADMIN)
// =================================================================

// GET /:id
router.get(
  "/:id",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  pagoController.findById
);

// PUT /:id
router.put(
  "/:id",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  pagoController.update
);

// DELETE /:id
router.delete(
  "/:id",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  pagoController.softDelete
);

module.exports = router;
