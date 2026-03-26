// routes/pago.routes.js (ACTUALIZADO CON NUEVAS RUTAS)

const express = require("express");
const router = express.Router();
const pagoController = require("../controllers/pago.controller");
const authMiddleware = require("../middleware/auth.middleware");
const checkKYCandTwoFA = require("../middleware/checkKYCandTwoFA");
const { blockAdminTransactions } = require("../middleware/roleValidation");
const { userRateLimiter } = require("../middleware/rateLimiter");
// =================================================================
// 1. RUTAS ESTÁTICAS Y SEMI-DINÁMICAS (USUARIO y ADMIN)
// =================================================================

// GET /mis_pagos
router.get(
  "/mis_pagos",
  authMiddleware.authenticate,
  pagoController.findMyPayments,
);

// POST /confirmar-pago-2fa
// 🔒 OPERACIÓN CRÍTICA: Confirma pago con verificación 2FA (NO admins)
router.post(
  "/confirmar-pago-2fa",
  authMiddleware.authenticate,
  blockAdminTransactions,
  checkKYCandTwoFA,
  pagoController.confirmarPagoYContinuar,
);

// 🆕 POST /generar-adelantados (SOLO ADMIN)
// Permite generar múltiples pagos por adelantado para una suscripción
router.post(
  "/generar-adelantados",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  pagoController.generateAdvancePayments,
);
router.get(
  "/historial/suscripcion/:suscripcionId",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  pagoController.getHistorialSuscripcion,
);
router.get(
  "/historial/mi-suscripcion/:suscripcionId",
  authMiddleware.authenticate,
  pagoController.getMySubscriptionHistory,
);

// 🆕 GET /pendientes/suscripcion/:id_suscripcion (SOLO ADMIN)
// Obtiene pagos pendientes de una suscripción específica
router.get(
  "/pendientes/suscripcion/:id_suscripcion",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  pagoController.getPendingPaymentsBySubscription,
);

// GET /metricas/mensuales (Admin)
router.get(
  "/metricas/mensuales",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  pagoController.getMonthlyMetrics,
);

// GET /metricas/a-tiempo (Admin)
router.get(
  "/metricas/a-tiempo",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  pagoController.getOnTimeRate,
);

// GET /
router.get(
  "/",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  pagoController.findAll,
);

// POST /trigger-manual-payment (Admin, prueba)
router.post(
  "/trigger-manual-payment",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  pagoController.triggerManualPayment,
);

// =================================================================
// 2. RUTAS DINÁMICAS CON PREFIJO (Semi-Dinámicas)
// =================================================================

// POST /pagar-mes/:id
// 🔒 OPERACIÓN CRÍTICA: Inicia el pago de una mensualidad (NO admins)
router.post(
  "/pagar-mes/:id",
  authMiddleware.authenticate,
  blockAdminTransactions,
  userRateLimiter,
  checkKYCandTwoFA,
  pagoController.requestCheckout,
);

// 🆕 PATCH /:id/monto (Admin)
// Permite cambiar el monto de un pago pendiente/vencido
router.patch(
  "/:id/monto",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  pagoController.updatePaymentAmount,
);
router.patch(
  "/:id/estado",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  pagoController.updatePaymentStatus,
);

// =================================================================
// 3. RUTAS DINÁMICAS GENÉRICAS (ADMIN)
// =================================================================

// GET /:id
router.get(
  "/:id",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  pagoController.findById,
);

// PUT /:id
router.put(
  "/:id",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  pagoController.update,
);

// DELETE /:id
router.delete(
  "/:id",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  pagoController.softDelete,
);

module.exports = router;
