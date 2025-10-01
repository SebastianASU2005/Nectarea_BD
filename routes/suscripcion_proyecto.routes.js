const express = require('express');
const router = express.Router();
const suscripcionProyectoController = require('../controllers/suscripcion_proyecto.controller');
const authMiddleware = require('../middleware/auth.middleware');

// Rutas para administradores
router.get('/', authMiddleware.authenticate, authMiddleware.authorizeAdmin, suscripcionProyectoController.findAll);
router.get('/:id', authMiddleware.authenticate, authMiddleware.authorizeAdmin, suscripcionProyectoController.findById);
router.delete('/:id', authMiddleware.authenticate, authMiddleware.authorizeAdmin, suscripcionProyectoController.softDelete);

// Rutas para usuarios
// CORRECCIÓN APLICADA AQUÍ: Se cambió 'processFirstSubscriptionPayment' por 'iniciarSuscripcion'
router.post('/iniciar-pago', authMiddleware.authenticate, suscripcionProyectoController.iniciarSuscripcion); 

router.get('/activas', authMiddleware.authenticate, suscripcionProyectoController.findAllActivo);
router.get('/mis_suscripciones', authMiddleware.authenticate, suscripcionProyectoController.findMySubscriptions);
router.get('/mis_suscripciones/:id', authMiddleware.authenticate, suscripcionProyectoController.findMySubscriptionById);
router.delete('/mis_suscripciones/:id', authMiddleware.authenticate, suscripcionProyectoController.softDeleteMySubscription);

// Además, faltaba la ruta del webhook, que debe ser pública:
router.post('/confirmar-pago', suscripcionProyectoController.confirmarSuscripcion); 

module.exports = router;
