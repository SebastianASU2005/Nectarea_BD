const express = require('express');
const router = express.Router();
const pujaController = require('../controllers/puja.controller');
const authMiddleware = require('../middleware/auth.middleware');

// Rutas para administradores
router.get('/', authMiddleware.authenticate, authMiddleware.authorizeAdmin, pujaController.findAll);
router.get('/:id', authMiddleware.authenticate, authMiddleware.authorizeAdmin, pujaController.findById);
router.put('/:id', authMiddleware.authenticate, authMiddleware.authorizeAdmin, pujaController.update);
router.delete('/:id', authMiddleware.authenticate, authMiddleware.authorizeAdmin, pujaController.softDelete);

// Rutas para usuarios
router.post('/', authMiddleware.authenticate, pujaController.create);
router.get('/activas', authMiddleware.authenticate, pujaController.findAllActivo);
router.get('/mis_pujas', authMiddleware.authenticate, pujaController.findMyPujas);
router.get('/mis_pujas/:id', authMiddleware.authenticate, pujaController.findMyPujaById);
router.put('/mis_pujas/:id', authMiddleware.authenticate, pujaController.updateMyPuja);
router.delete('/mis_pujas/:id', authMiddleware.authenticate, pujaController.softDeleteMyPuja);

// **NUEVA RUTA para la gestión de tokens al finalizar la subasta**
// Se recomienda proteger esta ruta solo para administradores
router.post('/gestionar_finalizacion', authMiddleware.authenticate, authMiddleware.authorizeAdmin, pujaController.manageAuctionEnd);

module.exports = router;