// routes/adhesion.routes.js
const express = require("express");
const router = express.Router();
const adhesionController = require("../controllers/adhesion.controller");
const authMiddleware = require("../middleware/auth.middleware");
const checkKYCandTwoFA = require("../middleware/checkKYCandTwoFA");
const { blockAdminTransactions } = require("../middleware/roleValidation");
const { userRateLimiter } = require("../middleware/rateLimiter");

// ===============================================
// 1. RUTAS ESTÁTICAS DE ADMINISTRACIÓN
// DEBEN ir antes de /:id para evitar que Express
// las interprete como parámetros dinámicos.
// ===============================================

// Listar todas las adhesiones del sistema (auditoría)
router.get(
  "/admin/all",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  adhesionController.listarTodasAdhesiones,
);

// Métricas globales de adhesiones
router.get(
  "/admin/metrics",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  adhesionController.getAdhesionMetrics,
);

// Cuotas de adhesión vencidas
router.get(
  "/admin/overdue",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  adhesionController.getOverdueAdhesionPayments,
);

// Historial de pagos de una adhesión específica
router.get(
  "/admin/payment-history/:adhesionId",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  adhesionController.getPaymentHistory,
);

// Forzar el pago de una cuota de adhesión
router.post(
  "/admin/forzar-pago",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  adhesionController.forzarPagoCuota,
);

// ===============================================
// 2. RUTAS ESTÁTICAS DE USUARIO
// También deben ir antes de /:id
// ===============================================

// Listar todas las adhesiones del usuario autenticado
router.get(
  "/usuario",
  authMiddleware.authenticate,
  adhesionController.listarAdhesionesUsuario,
);

// Crear una nueva adhesión (plan de pago)
router.post(
  "/",
  authMiddleware.authenticate,
  blockAdminTransactions,
  userRateLimiter,
  checkKYCandTwoFA,
  adhesionController.crearAdhesion,
);

// Paso 1: Iniciar pago de cuota (valida y, si hay 2FA, solicita código)
router.post(
  "/iniciar-pago-cuota",
  authMiddleware.authenticate,
  blockAdminTransactions,
  userRateLimiter,
  checkKYCandTwoFA,
  adhesionController.iniciarPagoCuota,
);

// Paso 2: Confirmar pago de cuota con código 2FA
// — userRateLimiter agregado para evitar fuerza bruta del código TOTP
router.post(
  "/confirmar-pago-cuota",
  authMiddleware.authenticate,
  blockAdminTransactions,
  userRateLimiter,
  adhesionController.confirmarPagoCuota,
);

// (Compatibilidad) Pagar cuota — método antiguo sin flujo 2FA
router.post(
  "/pagar-cuota",
  authMiddleware.authenticate,
  blockAdminTransactions,
  checkKYCandTwoFA,
  adhesionController.pagarCuotaAdhesion,
);

// Paso 2: Confirmar cancelación de adhesión con código 2FA
// — Va antes de /:id/iniciar-cancelacion para que Express no confunda
//   "confirmar-cancelacion" como un :id
// — Sin blockAdminTransactions: el controlador tiene lógica propia para admins
// — userRateLimiter agregado para evitar fuerza bruta del código TOTP
router.post(
  "/confirmar-cancelacion",
  authMiddleware.authenticate,
  userRateLimiter,
  adhesionController.confirmarCancelacionAdhesion,
);

// Obtener la adhesión asociada a una suscripción
// — Va antes de /:id para que "suscripcion" no sea capturado como parámetro
router.get(
  "/suscripcion/:suscripcionId",
  authMiddleware.authenticate,
  adhesionController.obtenerAdhesionPorSuscripcion,
);

// ===============================================
// 3. RUTAS DINÁMICAS (/:id y derivadas)
// Siempre al final
// ===============================================

// Obtener una adhesión específica por su ID
router.get(
  "/:id",
  authMiddleware.authenticate,
  adhesionController.obtenerAdhesion,
);

// Paso 1: Iniciar cancelación de adhesión
// — Sin blockAdminTransactions: el controlador permite que admins
//   cancelen adhesiones de otros usuarios usando req.user.rol
router.post(
  "/:id/iniciar-cancelacion",
  authMiddleware.authenticate,
  checkKYCandTwoFA,
  adhesionController.iniciarCancelacionAdhesion,
);

module.exports = router;
