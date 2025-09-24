const express = require('express');
const router = express.Router();
const transaccionController = require('../controllers/transaccion.controller');
const authMiddleware = require('../middleware/auth.middleware');

// Rutas para administradores
router.get('/', authMiddleware.authenticate, authMiddleware.authorizeAdmin, transaccionController.findAll);
router.get('/:id', authMiddleware.authenticate, authMiddleware.authorizeAdmin, transaccionController.findById);
router.put('/:id', authMiddleware.authenticate, authMiddleware.authorizeAdmin, transaccionController.update);
router.delete('/:id', authMiddleware.authenticate, authMiddleware.authorizeAdmin, transaccionController.softDelete);
router.put('/:id/confirmar',authMiddleware.authenticate, authMiddleware.authorizeAdmin, transaccionController.confirmarTransaccion);

// Rutas para usuarios
router.post('/', authMiddleware.authenticate, transaccionController.create);
router.get('/activas', authMiddleware.authenticate, transaccionController.findAllActivo);
router.get('/mis_transacciones', authMiddleware.authenticate, transaccionController.findMyTransactions);
router.get('/mis_transacciones/:id', authMiddleware.authenticate, transaccionController.findMyTransactionById);
router.put('/mis_transacciones/:id', authMiddleware.authenticate, transaccionController.updateMyTransaction);
router.delete('/mis_transacciones/:id', authMiddleware.authenticate, transaccionController.softDeleteMyTransaction);

module.exports = router;
