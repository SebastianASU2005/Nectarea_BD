const express = require('express');
const router = express.Router();
const transaccionController = require('../controllers/transaccion.controller');
const authMiddleware = require('../middleware/auth.middleware');

// Ruta protegida: Solo usuarios autenticados pueden crear una transacción
router.post('/', authMiddleware.authenticate, transaccionController.create);

// Ruta protegida para administradores: Solo los administradores pueden ver TODAS las transacciones
router.get('/', authMiddleware.authenticate, authMiddleware.authorizeAdmin, transaccionController.findAll);

// Ruta protegida: Solo usuarios autenticados pueden ver transacciones activas
router.get('/activas', authMiddleware.authenticate, transaccionController.findAllActivo);

// Ruta protegida: Solo usuarios autenticados pueden ver una transacción específica
router.get('/:id', authMiddleware.authenticate, transaccionController.findById);

// Rutas protegidas para administradores: Solo los administradores pueden actualizar o "eliminar" transacciones
router.put('/:id', authMiddleware.authenticate, authMiddleware.authorizeAdmin, transaccionController.update);
router.delete('/:id', authMiddleware.authenticate, authMiddleware.authorizeAdmin, transaccionController.softDelete);

module.exports = router;