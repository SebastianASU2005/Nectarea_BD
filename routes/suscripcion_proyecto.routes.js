// Archivo: routes/suscripcion_proyecto.routes.js

const express = require("express");
const router = express.Router();
const suscripcionProyectoController = require("../controllers/suscripcion_proyecto.controller");
const authMiddleware = require("../middleware/auth.middleware");
const { blockAdminTransactions } = require("../middleware/roleValidation");
const checkKYCandTwoFA = require("../middleware/checkKYCandTwoFA");

// =======================================================
// RUTAS PARA USUARIOS (Estáticas y Semidinámicas Primero)
// =======================================================

// POST /iniciar-pago
// 🔒 OPERACIÓN CRÍTICA: Inicia el proceso de suscripción
router.post(
  "/iniciar-pago",
  authMiddleware.authenticate,
  blockAdminTransactions, // ✅ YA TIENE
  checkKYCandTwoFA,
  suscripcionProyectoController.iniciarSuscripcion
);

// POST /confirmar-2fa
// 🔒 OPERACIÓN CRÍTICA: Verifica el código 2FA y genera la URL de checkout
router.post(
  "/confirmar-2fa",
  authMiddleware.authenticate,
  blockAdminTransactions, // ✅ YA TIENE
  checkKYCandTwoFA,
  suscripcionProyectoController.confirmarSuscripcionCon2FA
);

// GET /activas
router.get(
  "/activas",
  authMiddleware.authenticate,
  suscripcionProyectoController.findAllActivo
);

// GET /mis_suscripciones
router.get(
  "/mis_suscripciones",
  authMiddleware.authenticate,
  suscripcionProyectoController.findMySubscriptions
);

// GET /mis_suscripciones/:id
router.get(
  "/mis_suscripciones/:id",
  authMiddleware.authenticate,
  suscripcionProyectoController.findMySubscriptionById
);

// DELETE /mis_suscripciones/:id
// 🔒 OPERACIÓN SENSIBLE: Cancelar suscripción
router.delete(
  "/mis_suscripciones/:id",
  authMiddleware.authenticate,
  checkKYCandTwoFA,
  suscripcionProyectoController.softDeleteMySubscription
);

// POST /confirmar-pago (Webhook - puede ser llamado sin autenticación desde MP)
// ⚠️ NOTA: Si este endpoint es llamado por MercadoPago, NO debe tener authMiddleware
// Si es llamado desde tu frontend, entonces SÍ debe estar protegido
router.post(
  "/confirmar-pago",
  // ⚠️ DECISIÓN: ¿Este endpoint es llamado por MercadoPago o por tu frontend?
  // Si es por MP: NO poner middlewares de auth
  // Si es por tu frontend: descomentar las siguientes líneas:
  // authMiddleware.authenticate,
  // blockAdminTransactions,
  suscripcionProyectoController.confirmarSuscripcion
);

// =======================================================
// RUTAS PARA ADMINISTRADORES
// =======================================================

// GET /metrics/morosidad (KPI 4)
router.get(
  "/metrics/morosidad",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  suscripcionProyectoController.getMorosityMetrics
);

// GET /metrics/cancelacion (KPI 5)
router.get(
  "/metrics/cancelacion",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  suscripcionProyectoController.getCancellationRate
);

// GET /
router.get(
  "/",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  suscripcionProyectoController.findAll
);

// GET /proyecto/:id_proyecto/all
router.get(
  "/proyecto/:id_proyecto/all",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  suscripcionProyectoController.findAllByProjectId
);

// GET /proyecto/:id_proyecto (Solo activas)
router.get(
  "/proyecto/:id_proyecto",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  suscripcionProyectoController.findActiveByProjectId
);

// 🚨 RUTAS DINÁMICAS DE ADMIN (Van al final)
router.get(
  "/:id",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  suscripcionProyectoController.findById
);

router.delete(
  "/:id",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  suscripcionProyectoController.softDelete
);

module.exports = router;
