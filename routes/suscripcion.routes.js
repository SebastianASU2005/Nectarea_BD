const express = require("express");
const router = express.Router();
const suscripcionController = require("../controllers/suscripcion.controller");
const authMiddleware = require("../middleware/auth.middleware");

// =======================================================
// RUTAS PARA USUARIOS
// =======================================================

// 1. Cancelar suscripción
router.put(
  "/:id/cancelar",
  authMiddleware.authenticate,
  suscripcionController.cancel
);

// 2. Obtener las suscripciones canceladas del usuario autenticado
router.get(
  "/mis_canceladas",
  authMiddleware.authenticate,
  suscripcionController.findMyCanceladas // <-- Implementada en el paso anterior
);

// =======================================================
// RUTAS PARA ADMINISTRADORES
// =======================================================

// 3. Obtener TODAS las suscripciones canceladas (Solo para Admin)
router.get(
  "/canceladas",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  suscripcionController.findAllCanceladas // <-- Implementada en el paso anterior
);
// 4. Obtener las suscripciones canceladas por ID de Proyecto (Solo para Admin)
router.get(
  "/proyecto/canceladas/:id",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  suscripcionController.findByProjectCanceladas
);

module.exports = router;
