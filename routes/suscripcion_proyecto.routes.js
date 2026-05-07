// routes/suscripcion_proyecto.routes.js
const express = require("express");
const router = express.Router();
const suscripcionProyectoController = require("../controllers/suscripcion_proyecto.controller");
const authMiddleware = require("../middleware/auth.middleware");
const { blockAdminTransactions } = require("../middleware/roleValidation");
const checkKYCandTwoFA = require("../middleware/checkKYCandTwoFA");
const { userRateLimiter } = require("../middleware/rateLimiter");

// =======================================================
// RUTAS PARA USUARIOS (Estáticas y Semidinámicas Primero)
// =======================================================

// Iniciar el proceso de suscripción (crea pago y transacción pendientes)
router.post(
  "/iniciar-pago",
  authMiddleware.authenticate,
  blockAdminTransactions,
  checkKYCandTwoFA,
  userRateLimiter,
  suscripcionProyectoController.iniciarSuscripcion,
);

// Confirmar suscripción con 2FA (genera checkout)
// — userRateLimiter agregado para evitar fuerza bruta del código TOTP
router.post(
  "/confirmar-2fa",
  authMiddleware.authenticate,
  blockAdminTransactions,
  checkKYCandTwoFA,
  userRateLimiter,
  suscripcionProyectoController.confirmarSuscripcionCon2FA,
);

// Confirmar pago de suscripción (webhook o callback interno)
router.post(
  "/confirmar-pago",
  authMiddleware.authenticate,
  blockAdminTransactions,
  suscripcionProyectoController.confirmarSuscripcion,
);

// Obtener todas las suscripciones activas (admin)
router.get(
  "/activas",
  authMiddleware.authenticate,
  suscripcionProyectoController.findAllActivo,
);

// Obtener las suscripciones del usuario autenticado
router.get(
  "/mis_suscripciones",
  authMiddleware.authenticate,
  suscripcionProyectoController.findMySubscriptions,
);

// =======================================================
// CANCELACIÓN DE SUSCRIPCIÓN CON 2FA (dos pasos)
// =======================================================

// Paso 2: Confirmar cancelación con código 2FA
// — Va ANTES de /mis_suscripciones/:id para que Express no confunda
//   "confirmar-cancelacion" como un :id
// — userRateLimiter agregado para evitar fuerza bruta del código TOTP
router.post(
  "/mis_suscripciones/confirmar-cancelacion",
  authMiddleware.authenticate,
  userRateLimiter,
  suscripcionProyectoController.confirmarCancelacionSuscripcion,
);

// Obtener una suscripción específica del usuario autenticado
router.get(
  "/mis_suscripciones/:id",
  authMiddleware.authenticate,
  suscripcionProyectoController.findMySubscriptionById,
);

// Paso 1: Iniciar cancelación de suscripción
router.post(
  "/mis_suscripciones/:id/iniciar-cancelacion",
  authMiddleware.authenticate,
  checkKYCandTwoFA,
  suscripcionProyectoController.iniciarCancelacionSuscripcion,
);

// =======================================================
// RUTAS PARA ADMINISTRADORES
// =======================================================

// Métricas de morosidad (KPI 4)
router.get(
  "/metrics/morosidad",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  suscripcionProyectoController.getMorosityMetrics,
);

// Tasa de cancelación (KPI 5)
router.get(
  "/metrics/cancelacion",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  suscripcionProyectoController.getCancellationRate,
);

// Obtener todas las suscripciones (admin)
router.get(
  "/",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  suscripcionProyectoController.findAll,
);

// Obtener todas las suscripciones de un proyecto (activas e inactivas)
router.get(
  "/proyecto/:id_proyecto/all",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  suscripcionProyectoController.findAllByProjectId,
);

// Obtener suscripciones activas de un proyecto
router.get(
  "/proyecto/:id_proyecto",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  suscripcionProyectoController.findActiveByProjectId,
);

// Obtener suscripción por ID (admin)
router.get(
  "/:id",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  suscripcionProyectoController.findById,
);
// =======================================================
// RUTAS PARA ADMINISTRADORES – GESTIÓN DE STANDBY
// =======================================================

// Activar período de pausa (standby) de 6 meses en una suscripción (solo admin)
router.post(
  "/:id/standby/activate",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  suscripcionProyectoController.activateStandby,
);

// Desactivar período de pausa anticipadamente (solo admin)
router.delete(
  "/:id/standby/deactivate",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  suscripcionProyectoController.deactivateStandby,
);

// Actualizar campos de una suscripción (admin)
router.patch(
  "/:id",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  suscripcionProyectoController.adminUpdate,
);

// Cancelar suscripción por ID (admin — evita el flujo de 2FA)
router.delete(
  "/:id",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  suscripcionProyectoController.softDelete,
);

module.exports = router;
