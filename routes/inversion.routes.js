const express = require("express");
const router = express.Router();
const inversionController = require("../controllers/inversion.controller");
const authMiddleware = require("../middleware/auth.middleware");

// Ruta protegida: Solo usuarios autenticados pueden crear una inversión
router.post("/", authMiddleware.authenticate, inversionController.create);

// 🚀 NUEVA RUTA: Inicia el proceso de pago para una inversión pendiente. Aplica la bifurcación 2FA.
router.post(
  "/iniciar-pago/:idInversion",
  authMiddleware.authenticate,
  inversionController.requestCheckoutInversion
);

// 🚀 NUEVA RUTA: Verifica el 2FA y genera el checkout para la inversión pendiente.
router.post(
  "/confirmar-2fa",
  authMiddleware.authenticate,
  inversionController.confirmarInversionCon2FA
);

// Ruta protegida para administradores: Solo los administradores pueden ver TODAS las inversiones
router.get(
  "/",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  inversionController.findAll
);

// **NUEVA RUTA**: Solo un usuario autenticado puede ver sus propias inversiones
router.get(
  "/mis_inversiones",
  authMiddleware.authenticate,
  inversionController.findMyInversions
);

// Ruta protegida para administradores: Solo los administradores pueden ver inversiones activas
router.get(
  "/activas",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  inversionController.findAllActivo
);

// Ruta protegida: Solo usuarios autenticados pueden ver una inversión específica
router.get("/:id", authMiddleware.authenticate, inversionController.findById);

// Rutas protegidas para administradores: Solo los administradores pueden actualizar o "eliminar" inversiones
router.put(
  "/:id",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  inversionController.update
);
router.delete(
  "/:id",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  inversionController.softDelete
);

module.exports = router;
