// routes/usuario.routes.js

const express = require('express');
const router = express.Router();
const usuarioController = require('../controllers/usuario.controller');

// Definir las rutas de la API y conectarlas al controlador
router.post('/', usuarioController.create);
router.get('/', usuarioController.findAll);
router.get('/activos', usuarioController.findAllActivo);
router.get('/:id', usuarioController.findById);
router.put('/:id', usuarioController.update);
router.delete('/:id', usuarioController.softDelete);

module.exports = router;