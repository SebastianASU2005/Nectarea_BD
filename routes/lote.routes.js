const express = require('express');
const router = express.Router();
const loteController = require('../controllers/lote.controller');
const authMiddleware = require('../middleware/auth.middleware');

// Rutas de subasta para usuarios autenticados
router.post('/:id/start_auction', authMiddleware.authenticate, loteController.startAuction);
router.post('/:id/end', authMiddleware.authenticate, loteController.endAuction);

// Rutas de lotes activos (para que los usuarios puedan verlos)
router.get('/activos', authMiddleware.authenticate, loteController.findAllActivo);
router.get('/:id/activo', authMiddleware.authenticate, loteController.findByIdActivo);

// Rutas de CRUD para administradores
router.get('/', authMiddleware.authenticate, authMiddleware.authorizeAdmin, loteController.findAll);
router.get('/:id', authMiddleware.authenticate, authMiddleware.authorizeAdmin, loteController.findById);
router.post('/', authMiddleware.authenticate, authMiddleware.authorizeAdmin, loteController.create);
router.put('/:id', authMiddleware.authenticate, authMiddleware.authorizeAdmin, loteController.update);
router.delete('/:id', authMiddleware.authenticate, authMiddleware.authorizeAdmin, loteController.softDelete);


module.exports = router;