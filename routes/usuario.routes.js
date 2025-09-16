const express = require('express');
const router = express.Router();
const usuarioController = require('../controllers/usuario.controller');
const authMiddleware = require('../middleware/auth.middleware');

// Rutas protegidas para administradores: Solo los administradores pueden crear un nuevo usuario
router.post('/', usuarioController.create);

// Rutas protegidas para administradores: Solo los administradores pueden ver TODOS los usuarios (activos e inactivos)
router.get('/', authMiddleware.authenticate, authMiddleware.authorizeAdmin, usuarioController.findAll);

// Rutas protegidas para administradores: Solo los administradores pueden ver usuarios activos
router.get('/activos', authMiddleware.authenticate, authMiddleware.authorizeAdmin, usuarioController.findAllActivo);

// Rutas protegidas para administradores: Solo los administradores pueden ver un usuario específico por su ID
router.get('/:id', authMiddleware.authenticate, authMiddleware.authorizeAdmin, usuarioController.findById);

// Rutas protegidas para administradores: Solo los administradores pueden actualizar o "eliminar" usuarios
router.put('/:id', authMiddleware.authenticate, authMiddleware.authorizeAdmin, usuarioController.update);
router.delete('/:id', authMiddleware.authenticate, authMiddleware.authorizeAdmin, usuarioController.softDelete);

module.exports = router;