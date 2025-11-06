// routes/inversion.routes.js

const express = require("express");
const router = express.Router();
const inversionController = require("../controllers/inversion.controller");
const authMiddleware = require("../middleware/auth.middleware");
const checkKYCandTwoFA = require("../middleware/checkKYCandTwoFA"); // 🔒 NUEVO

// ===============================================
// 1. RUTAS POST (Estáticas y Semi-Dinámicas)
// ===============================================

// POST /
// 🔒 OPERACIÓN CRÍTICA: Crear inversión (requiere KYC + 2FA)
router.post(
  "/",
  authMiddleware.authenticate,
  checkKYCandTwoFA, // 🚨 MIDDLEWARE DE SEGURIDAD OBLIGATORIO
  inversionController.create
);

// POST /confirmar-2fa
// 🔒 OPERACIÓN CRÍTICA: Verifica el 2FA para continuar con el pago
router.post(
  "/confirmar-2fa",
  authMiddleware.authenticate,
  checkKYCandTwoFA, // 🚨 DOBLE VERIFICACIÓN
  inversionController.confirmarInversionCon2FA
);

// POST /iniciar-pago/:idInversion
// 🔒 OPERACIÓN CRÍTICA: Inicia el proceso de pago (requiere KYC + 2FA)
router.post(
  "/iniciar-pago/:idInversion",
  authMiddleware.authenticate,
  checkKYCandTwoFA, // 🚨 PROTECCIÓN DE TRANSACCIÓN
  inversionController.requestCheckoutInversion
);

// ===============================================
// 2. RUTAS GET (Estáticas y Con Prefijo)
// ===============================================

// GET /
router.get(
  "/",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  inversionController.findAll
);

// GET /metricas/liquidez (KPI 6)
router.get(
  "/metricas/liquidez",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  inversionController.getLiquidityRate
);

// GET /metricas/agregado-por-usuario (KPI 7)
router.get(
  "/metricas/agregado-por-usuario",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  inversionController.getAggregatedByUser
);

// GET /mis_inversiones
router.get(
  "/mis_inversiones",
  authMiddleware.authenticate,
  inversionController.findMyInversions
);

// GET /activas
router.get(
  "/activas",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  inversionController.findAllActivo
);

// GET /:id (DINÁMICO - Va al final)
router.get("/:id", authMiddleware.authenticate, inversionController.findById);

// ===============================================
// 3. RUTAS PUT/DELETE (DINÁMICAS GENÉRICAS)
// ===============================================

// PUT /:id
router.put(
  "/:id",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  inversionController.update
);

// DELETE /:id
router.delete(
  "/:id",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  inversionController.softDelete
);

module.exports = router;
