// Archivo: routes/suscripcion_proyecto.routes.js

const express = require("express");
const router = express.Router();
const suscripcionProyectoController = require("../controllers/suscripcion_proyecto.controller");
const authMiddleware = require("../middleware/auth.middleware");

// =======================================================
// RUTAS PARA USUARIOS (Estáticas y Semidinámicas Primero)
// =======================================================

// Inicia el proceso de pago/suscripción.
router.post(
  "/iniciar-pago",
  authMiddleware.authenticate,
  suscripcionProyectoController.iniciarSuscripcion
);

// Verifica el código 2FA y genera la URL de checkout
router.post(
  "/confirmar-2fa",
  authMiddleware.authenticate,
  suscripcionProyectoController.confirmarSuscripcionCon2FA
);

router.get(
  "/activas",
  authMiddleware.authenticate,
  suscripcionProyectoController.findAllActivo
);

// ✅ RUTA CORREGIDA: Va antes que /:id para evitar el conflicto
router.get(
  "/mis_suscripciones",
  authMiddleware.authenticate,
  suscripcionProyectoController.findMySubscriptions
);

router.get(
  "/mis_suscripciones/:id",
  authMiddleware.authenticate,
  suscripcionProyectoController.findMySubscriptionById
);
router.delete(
  "/mis_suscripciones/:id",
  authMiddleware.authenticate,
  suscripcionProyectoController.softDeleteMySubscription
);

// Webhook que debe ser pública (Estática, puede ir aquí o al final)
router.post(
  "/confirmar-pago",
  suscripcionProyectoController.confirmarSuscripcion
);

// =======================================================
// RUTAS PARA ADMINISTRADORES (Generales y Dinámicas al final)
// =======================================================

// Obtener todas las suscripciones
router.get(
  "/",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  suscripcionProyectoController.findAll
);

// 🚨 RUTAS DINÁMICAS DE ADMIN (Van al final de este nivel para no colisionar)
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
