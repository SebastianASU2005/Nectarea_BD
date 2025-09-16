const express = require('express');
const router = express.Router();
const loteController = require('../controllers/lote.controller');
const authMiddleware = require('../middleware/auth.middleware');

// Ruta protegida para administradores: Solo los administradores pueden crear un lote
router.post('/', authMiddleware.authenticate, authMiddleware.authorizeAdmin, loteController.create);

// Ruta protegida para administradores: Solo los administradores pueden ver TODOS los lotes
router.get('/', authMiddleware.authenticate, authMiddleware.authorizeAdmin, loteController.findAll);

// Ruta protegida: Solo usuarios autenticados pueden ver los lotes activos
router.get('/activos', authMiddleware.authenticate, loteController.findAllActivo);

// Ruta protegida: Solo usuarios autenticados pueden ver un lote específico
router.get('/:id', authMiddleware.authenticate, loteController.findById);

// Rutas protegidas para administradores: Solo los administradores pueden actualizar o "eliminar" lotes
router.put('/:id', authMiddleware.authenticate, authMiddleware.authorizeAdmin, loteController.update);
router.delete('/:id', authMiddleware.authenticate, authMiddleware.authorizeAdmin, loteController.softDelete);

module.exports = router;