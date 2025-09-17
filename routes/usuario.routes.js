const express = require('express');
const router = express.Router();
const usuarioController = require('../controllers/usuario.controller');
const authMiddleware = require('../middleware/auth.middleware');

// Rutas de administración
router.post('/', usuarioController.create);
router.get('/', authMiddleware.authenticate, authMiddleware.authorizeAdmin, usuarioController.findAll);
router.get('/activos', authMiddleware.authenticate, authMiddleware.authorizeAdmin, usuarioController.findAllActivo);
router.get('/:id', authMiddleware.authenticate, authMiddleware.authorizeAdmin, usuarioController.findById);
router.put('/:id', authMiddleware.authenticate, authMiddleware.authorizeAdmin, usuarioController.update);
router.delete('/:id', authMiddleware.authenticate, authMiddleware.authorizeAdmin, usuarioController.softDelete);

// Nuevas rutas para que un usuario acceda y modifique su propio perfil
router.get('/me', authMiddleware.authenticate, usuarioController.findMe);
router.put('/me', authMiddleware.authenticate, usuarioController.updateMe);
router.delete('/me', authMiddleware.authenticate, usuarioController.softDeleteMe);

module.exports = router;
