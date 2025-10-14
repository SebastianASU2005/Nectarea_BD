// Archivo: routes/puja.routes.js

const express = require("express");
const router = express.Router();
const pujaController = require("../controllers/puja.controller");
const authMiddleware = require("../middleware/auth.middleware");

// =======================================================
// RUTAS PARA USUARIOS (Estáticas primero, dinámicas después)
// =======================================================

router.post("/", authMiddleware.authenticate, pujaController.create);
router.get(
  "/activas",
  authMiddleware.authenticate,
  pujaController.findAllActivo
);
// ✅ RUTA CORREGIDA: Va antes que /:id para evitar el conflicto
router.get(
  "/mis_pujas",
  authMiddleware.authenticate,
  pujaController.findMyPujas
);
router.get(
  "/mis_pujas/:id",
  authMiddleware.authenticate,
  pujaController.findMyPujaById
);
router.delete(
  "/mis_pujas/:id",
  authMiddleware.authenticate,
  pujaController.softDeleteMyPuja
);

// RUTA DE PAGO INICIAL: Inicia el proceso de checkout (bifurcación 2FA).
router.post(
  "/iniciar-pago/:id",
  authMiddleware.authenticate,
  pujaController.requestCheckout
);

// NUEVA RUTA: Verifica el 2FA y genera el checkout para la puja ganadora.
router.post(
  "/confirmar-2fa",
  authMiddleware.authenticate,
  pujaController.confirmarPujaCon2FA
);

// =======================================================
// RUTAS PARA ADMINISTRADORES (Estáticas/Generales primero)
// =======================================================

// Obtener todas las pujas
router.get(
  "/",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  pujaController.findAll
);

// NUEVA RUTA para la gestión de tokens al finalizar la subasta (Estática)
router.post(
  "/gestionar_finalizacion",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  pujaController.manageAuctionEnd
);

// 🚨 RUTAS DINÁMICAS DE ADMIN (Van al final para no colisionar con rutas estáticas superiores)
router.get(
  "/:id",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  pujaController.findById
);
router.put(
  "/:id",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  pujaController.update
);
router.delete(
  "/:id",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  pujaController.softDelete
);

module.exports = router;
