const express = require('express');
const paymentController = require('../controllers/pagoMercado.controller');
// ⚠️ CORRECCIÓN DE IMPORTACIÓN: Importamos el objeto completo 'authMiddleware'
const authMiddleware = require('../middleware/auth.middleware'); 

const router = express.Router();

// ===============================================
// RUTAS PRIVADAS (Requieren autenticación)
// ===============================================

/**
 * @route POST /api/payment/checkout
 * @description Inicia el proceso de pago para una inversión específica.
 * Requiere: { id_inversion: 123, metodo: 'mercadopago' }
 */
// ⚠️ CORRECCIÓN CRÍTICA: Usamos authMiddleware.authenticate (que es el nombre correcto en el middleware)
router.post('/checkout', authMiddleware.authenticate, paymentController.createCheckout);

/**
 * @route GET /api/payment/status/:id_inversion
 * @description Consulta el estado del pago de una inversión.
 */
router.get('/status/:id_inversion', authMiddleware.authenticate, paymentController.getPaymentStatus);


// ===============================================
// RUTA PÚBLICA (Webhook)
// ===============================================

/**
 * @route POST /api/payment/webhook/:metodo 
 * @description Endpoint de notificación llamado por la pasarela de pago (Mercado Pago).
 * * NOTA: Esta ruta DEBE ser pública (sin checkAuth) ya que es llamada
 * por el servidor de Mercado Pago.
 */
router.post('/webhook/:metodo', paymentController.handleWebhook); 


module.exports = router;
