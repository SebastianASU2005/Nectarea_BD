// Archivo: routes/transaccion.routes.js

const express = require("express");
const router = express.Router();
const transaccionController = require("../controllers/transaccion.controller");
const authMiddleware = require("../middleware/auth.middleware");

// =======================================================
// RUTAS PARA ADMINISTRADORES (Estáticas Primero)
// =======================================================

// Obtener todas las transacciones (Estática)
router.get(
  "/",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  transaccionController.findAll
);

// NUEVA RUTA: Ruta para que el administrador pueda forzar la confirmación (Semidinámica, va antes que /:id)
router.put(
  "/:id/confirmar",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  transaccionController.confirmarTransaccion
);

// =======================================================
// RUTAS PARA USUARIOS (Estáticas y Semidinámicas)
// =======================================================

// ✅ RUTA CORREGIDA: Ahora va antes que /:id para evitar el conflicto
router.get(
  "/mis_transacciones",
  authMiddleware.authenticate,
  transaccionController.findMyTransactions
);

router.get(
  "/mis_transacciones/:id",
  authMiddleware.authenticate,
  transaccionController.findMyTransactionById
);
router.put(
  "/mis_transacciones/:id",
  authMiddleware.authenticate,
  transaccionController.updateMyTransaction
);

// =======================================================
// RUTAS DINÁMICAS DE ADMINISTRADOR (Van al final)
// =======================================================

router.get(
  "/:id",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  transaccionController.findById
);
router.put(
  "/:id",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  transaccionController.update
);
router.delete(
  "/:id",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  transaccionController.softDelete
);

module.exports = router;
