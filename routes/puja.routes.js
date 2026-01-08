// Archivo: routes/puja.routes.js

const express = require("express");
const router = express.Router();
const pujaController = require("../controllers/puja.controller");
const authMiddleware = require("../middleware/auth.middleware");
const { blockAdminTransactions } = require("../middleware/roleValidation"); // ✅ NUEVO: Importación

// =======================================================
// RUTAS PARA USUARIOS (Estáticas primero, dinámicas después)
// =======================================================

// POST /
// 🔒 OPERACIÓN CRÍTICA: Crear puja (Añadir blockAdminTransactions)
router.post(
  "/",
  authMiddleware.authenticate,
  blockAdminTransactions, // ✅ Bloquea admins
  pujaController.create
);

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

// DELETE /mis_pujas/:id
// Nota: Aunque el soft-delete es una "transacción" del cliente sobre su data,
// usualmente solo las operaciones de **dinero/riesgo** llevan el bloqueo.
// Lo dejaré sin bloquear, similar a la lógica de contratos/inversiones GET/DELETE.
router.delete(
  "/mis_pujas/:id",
  authMiddleware.authenticate,
  pujaController.softDeleteMyPuja
);

// RUTA DE PAGO INICIAL: Inicia el proceso de checkout (bifurcación 2FA).
// 🔒 OPERACIÓN CRÍTICA: Iniciar pago (Añadir blockAdminTransactions)
router.post(
  "/iniciar-pago/:id",
  authMiddleware.authenticate,
  blockAdminTransactions, // ✅ Bloquea admins
  pujaController.requestCheckout
);

// NUEVA RUTA: Verifica el 2FA y genera el checkout para la puja ganadora.
// 🔒 OPERACIÓN CRÍTICA: Confirmar 2FA (Añadir blockAdminTransactions)
router.post(
  "/confirmar-2fa",
  authMiddleware.authenticate,
  blockAdminTransactions, // ✅ Bloquea admins
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
// Esta es una acción de admin, NO debe llevar blockAdminTransactions.
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
router.post(
  "/cancelar_puja_ganadora/:id",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  pujaController.cancelarPujaGanadoraAnticipada
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
