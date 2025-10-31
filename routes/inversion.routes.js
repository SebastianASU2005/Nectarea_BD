const express = require("express");
const router = express.Router();
const inversionController = require("../controllers/inversion.controller");
const authMiddleware = require("../middleware/auth.middleware");

// ===============================================
// 1. RUTAS POST (Estáticas y Semi-Dinámicas)
// ===============================================

// Ruta protegida: Solo usuarios autenticados pueden crear una inversión (Estática)
router.post("/", authMiddleware.authenticate, inversionController.create);

// 🚀 NUEVA RUTA: Verifica el 2FA (Estática con prefijo fijo)
router.post(
  "/confirmar-2fa",
  authMiddleware.authenticate,
  inversionController.confirmarInversionCon2FA
);

// 🚀 RUTA DINÁMICA POST: Inicia el proceso de pago. Va al final de los POST.
router.post(
  "/iniciar-pago/:idInversion",
  authMiddleware.authenticate,
  inversionController.requestCheckoutInversion
);

// ===============================================
// 2. RUTAS GET (Estáticas y Con Prefijo - ¡CRÍTICO!)
// ===============================================

// Ruta protegida para administradores: Ver TODAS las inversiones (GET estático)
router.get(
  "/",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  inversionController.findAll
);
router.get(
  "/metricas/liquidez",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  inversionController.getLiquidityRate
);

// 🎯 NUEVA RUTA: Inversión Agregada por Usuario (Base para KPI 7)
router.get(
  "/metricas/agregado-por-usuario",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  inversionController.getAggregatedByUser
);

// **NUEVA RUTA**: Ver sus propias inversiones (Estática con prefijo, ¡va antes de /:id!)
router.get(
  "/mis_inversiones",
  authMiddleware.authenticate,
  inversionController.findMyInversions
);

// Ruta protegida para administradores: Ver inversiones activas (Estática con prefijo, ¡va antes de /:id!)
router.get(
  "/activas",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  inversionController.findAllActivo
);

// Ruta protegida: Solo usuarios autenticados pueden ver una inversión específica (GET DINÁMICO)
// ⚠️ ESTA DEBE IR AL FINAL DE TODOS LOS GET
router.get("/:id", authMiddleware.authenticate, inversionController.findById);

// ===============================================
// 3. RUTAS PUT/DELETE (DINÁMICAS GENÉRICAS)
// Estas deben ir al final del archivo.
// ===============================================

// Rutas protegidas para administradores: Actualizar
router.put(
  "/:id",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  inversionController.update
);

// Rutas protegidas para administradores: "Eliminar"
router.delete(
  "/:id",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  inversionController.softDelete
);

module.exports = router;
