// routes/inversion.routes.js

const express = require("express");
const router = express.Router();
const inversionController = require("../controllers/inversion.controller");
const authMiddleware = require("../middleware/auth.middleware");
const checkKYCandTwoFA = require("../middleware/checkKYCandTwoFA");
const { blockAdminTransactions } = require("../middleware/roleValidation");
const { userRateLimiter } = require("../middleware/rateLimiter");

// ===============================================
// 1. RUTAS POST
// ===============================================

// POST /
// Paso 1: Registrar inversión en "pendiente".
// El middleware checkKYCandTwoFA ya no valida 2FA aquí porque en este
// punto el usuario todavía no lo usa — solo verifica KYC.
router.post(
  "/crear",
  authMiddleware.authenticate,
  blockAdminTransactions,
  checkKYCandTwoFA,
  inversionController.create,
);

// POST /pagar
// Paso 2: Verificar código 2FA y generar checkout.
// No lleva checkKYCandTwoFA porque el propio controlador valida
// el 2FA de forma más estricta (lo bloquea si no está activo).
// Lleva rate limiter para evitar fuerza bruta sobre el código 2FA.
router.post(
  "/pagar",
  authMiddleware.authenticate,
  blockAdminTransactions,
  userRateLimiter,
  inversionController.iniciarPago,
);

// ===============================================
// 2. RUTAS GET (Estáticas primero, dinámicas al final)
// ===============================================

// GET / — todas las inversiones (admin)
router.get(
  "/",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  inversionController.findAll,
);

// GET /metricas/liquidez — KPI 6 (admin)
router.get(
  "/metricas/liquidez",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  inversionController.getLiquidityRate,
);

// GET /metricas/agregado-por-usuario — KPI 7 (admin)
router.get(
  "/metricas/agregado-por-usuario",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  inversionController.getAggregatedByUser,
);

// GET /mis_inversiones — inversiones del usuario autenticado
router.get(
  "/mis_inversiones",
  authMiddleware.authenticate,
  inversionController.findMyInversions,
);

// GET /activas — inversiones activas (admin)
router.get(
  "/activas",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  inversionController.findAllActivo,
);

// GET /:id — por ID (admin) — SIEMPRE al final para no capturar rutas estáticas
router.get(
  "/:id",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  inversionController.findById,
);

// ===============================================
// 3. RUTAS PUT / DELETE
// ===============================================

// PUT /:id — actualizar inversión (admin)
router.put(
  "/:id",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  inversionController.update,
);

// DELETE /:id — soft delete (admin)
router.delete(
  "/:id",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  inversionController.softDelete,
);

module.exports = router;
