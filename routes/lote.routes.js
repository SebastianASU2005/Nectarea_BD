const express = require('express');
const router = express.Router();
const loteController = require('../controllers/lote.controller');
const authMiddleware = require('../middleware/auth.middleware');

// Rutas para administradores
router.post('/', authMiddleware.authenticate, authMiddleware.authorizeAdmin, loteController.create);
router.get('/', authMiddleware.authenticate, authMiddleware.authorizeAdmin, loteController.findAll);
// Usa findById para que los administradores puedan ver lotes eliminados
router.get('/:id', authMiddleware.authenticate, authMiddleware.authorizeAdmin, loteController.findById);
router.put('/:id', authMiddleware.authenticate, authMiddleware.authorizeAdmin, loteController.update);
router.delete('/:id', authMiddleware.authenticate, authMiddleware.authorizeAdmin, loteController.softDelete);

// Rutas para usuarios
router.get('/activos', authMiddleware.authenticate, loteController.findAllActivo);
// Usa findByIdActivo para que los usuarios solo puedan ver lotes activos
router.get('/:id', authMiddleware.authenticate, loteController.findByIdActivo);

module.exports = router;