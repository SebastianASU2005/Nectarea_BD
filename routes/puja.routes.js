const express = require("express");
const router = express.Router();
const pujaController = require("../controllers/puja.controller");
const authMiddleware = require("../middleware/auth.middleware");
const { blockAdminTransactions } = require("../middleware/roleValidation");
const { userRateLimiter } = require("../middleware/rateLimiter");
// RUTAS PARA USUARIOS
router.post(
  "/",
  authMiddleware.authenticate,
  blockAdminTransactions,
  pujaController.create,
);
router.get(
  "/activas",
  authMiddleware.authenticate,
  userRateLimiter,
  pujaController.findAllActivo,
);
router.get(
  "/mis_pujas",
  authMiddleware.authenticate,
  pujaController.findMyPujas,
);
router.delete(
  "/mis_pujas/:id/retirar",
  authMiddleware.authenticate,
  blockAdminTransactions,
  pujaController.retirarMiPuja,
);
router.get(
  "/mis_pujas/:id",
  authMiddleware.authenticate,
  pujaController.findMyPujaById,
);

router.post(
  "/iniciar-pago/:id",
  authMiddleware.authenticate,
  blockAdminTransactions,
  userRateLimiter,
  pujaController.requestCheckout,
);
router.post(
  "/confirmar-2fa",
  authMiddleware.authenticate,
  blockAdminTransactions,
  pujaController.confirmarPujaCon2FA,
);

// RUTAS PARA ADMINISTRADORES
router.get(
  "/",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  pujaController.findAll,
);
router.post(
  "/gestionar_finalizacion",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  pujaController.manageAuctionEnd,
);
router.delete(
  "/admin/:id/retirar",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  pujaController.retirarPujaAdmin,
);

// Dinámicas al final
router.post(
  "/cancelar_puja_ganadora/:id",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  pujaController.cancelarPujaGanadoraAnticipada,
);
router.get(
  "/:id",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  pujaController.findById,
);
router.post(
  "/cancelar_puja_ganadora/:id",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  pujaController.cancelarPujaGanadoraAnticipada,
);
router.put(
  "/:id",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  pujaController.update,
);
router.delete(
  "/:id",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  pujaController.softDelete,
);

module.exports = router;
