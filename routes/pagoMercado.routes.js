// Archivo: routes/pagoMercado.routes.js (o payment.routes.js)

const express = require("express");
const paymentController = require("../controllers/pagoMercado.controller");
const authMiddleware = require("../middleware/auth.middleware");

const router = express.Router();

// ===============================================
// RUTAS PRIVADAS (Requieren autenticación)
// ===============================================

/**
 * @route POST /api/payment/checkout/:modelo/:modeloId
 * @description NUEVA RUTA: Inicia el proceso de pago para un registro pendiente (Inversion, Puja, etc.)
 * @param {string} modelo - 'inversion', 'puja', 'pago'
 * @param {number} modeloId - ID del registro pendiente
 */
router.post(
  "/checkout/:modelo/:modeloId",
  authMiddleware.authenticate,
  paymentController.iniciarPagoPorModelo
);

/**
 * @route POST /api/payment/checkout/generico
 * @description Mantiene compatibilidad o flujo legacy que crea Transaccion + Checkout a la vez.
 */
router.post(
  "/checkout/generico",
  authMiddleware.authenticate,
  paymentController.createCheckoutGenerico
);

/**
 * @route POST /api/payment/checkout
 * @description Mantiene compatibilidad con el flujo antiguo de Inversión.
 */
router.post(
  "/checkout",
  authMiddleware.authenticate,
  paymentController.createCheckout
);

/**
 * @route GET /api/payment/status/:id_transaccion
 * @description Consulta el estado de pago de una transacción
 */
router.get(
  "/status/:id_transaccion",
  authMiddleware.authenticate,
  paymentController.getPaymentStatus
);

// ===============================================
// ❌ ELIMINAR ESTA RUTA DE AQUÍ: SE DEFINE EN SERVER.JS
// ===============================================

// router.post("/webhook/:metodo", paymentController.handleWebhook); 

module.exports = router;