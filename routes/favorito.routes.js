// routes/favorito.routes.js
const express = require('express');
const router = express.Router();
const favoritoController = require('../controllers/favorito.controller');
const authMiddleware = require('../middleware/auth.middleware');

// Rutas de usuarios autenticados
router.post('/toggle', authMiddleware.authenticate, favoritoController.toggleFavorito);
router.get('/mis-favoritos', authMiddleware.authenticate, favoritoController.getMisFavoritos);
router.get('/check/:id', authMiddleware.authenticate, favoritoController.checkFavorito);

// Rutas de administradores
router.get('/estadisticas', authMiddleware.authenticate,authMiddleware.authorizeAdmin, favoritoController.getEstadisticas);

module.exports = router;