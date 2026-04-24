// routes/adhesion.routes.js
const express = require("express");
const router = express.Router();
const adhesionController = require("../controllers/adhesion.controller");
const authMiddleware = require("../middleware/auth.middleware");

// ===============================================
// 1. RUTAS DE USUARIO (requieren autenticación)
// ===============================================

// Crear una nueva adhesión (plan de pago)
router.post("/", authMiddleware.authenticate, adhesionController.crearAdhesion);

// Obtener una adhesión específica por su ID (solo si pertenece al usuario)
router.get(
  "/:id",
  authMiddleware.authenticate,
  adhesionController.obtenerAdhesion,
);

// Listar todas las adhesiones del usuario autenticado
router.get(
  "/usuario",
  authMiddleware.authenticate,
  adhesionController.listarAdhesionesUsuario,
);

// Obtener la adhesión asociada a una suscripción (útil desde el perfil de suscripción)
router.get(
  "/suscripcion/:suscripcionId",
  authMiddleware.authenticate,
  adhesionController.obtenerAdhesionPorSuscripcion,
);

// Iniciar el pago de una cuota de adhesión (redirige a pasarela)
router.post(
  "/pagar-cuota",
  authMiddleware.authenticate,
  adhesionController.pagarCuotaAdhesion,
);

// Cancelar una adhesión (usuario dueño o admin)
router.delete(
  "/:id",
  authMiddleware.authenticate,
  adhesionController.cancelarAdhesion,
);

// ===============================================
// 2. RUTAS DE ADMINISTRACIÓN (requieren rol admin)
// ===============================================

// Forzar el pago de una cuota de adhesión (admin)
router.post(
  "/admin/forzar-pago",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  adhesionController.forzarPagoCuota,
);

// Listar todas las adhesiones del sistema (auditoría)
router.get(
  "/admin/all",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  adhesionController.listarTodasAdhesiones,
);

// 📊 MÉTRICAS Y AUDITORÍA PARA ADMINISTRADORES
// Obtener métricas generales de adhesiones (recaudación, morosidad, etc.)
router.get(
  "/admin/metrics",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  adhesionController.getAdhesionMetrics,
);

// Obtener lista de cuotas de adhesión vencidas (con datos de usuario y proyecto)
router.get(
  "/admin/overdue",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  adhesionController.getOverdueAdhesionPayments,
);

// Obtener historial completo de pagos de una adhesión específica (para auditoría)
router.get(
  "/admin/payment-history/:adhesionId",
  authMiddleware.authenticate,
  authMiddleware.authorizeAdmin,
  adhesionController.getPaymentHistory,
);

module.exports = router;
