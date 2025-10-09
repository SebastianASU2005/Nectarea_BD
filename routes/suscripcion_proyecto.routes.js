const express = require("express");
const router = express.Router();
const suscripcionProyectoController = require("../controllers/suscripcion_proyecto.controller");
const authMiddleware = require("../middleware/auth.middleware");

// Rutas para administradores
router.get(
  "/",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  suscripcionProyectoController.findAll
);
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

// Rutas para usuarios
// Inicia el proceso de pago/suscripción. Ahora puede requerir 2FA.
router.post(
  "/iniciar-pago",
  authMiddleware.authenticate,
  suscripcionProyectoController.iniciarSuscripcion
);

// 🚀 NUEVA RUTA: Verifica el código 2FA y genera la URL de checkout
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

// Webhook que debe ser pública
router.post(
  "/confirmar-pago",
  suscripcionProyectoController.confirmarSuscripcion
);

module.exports = router;
