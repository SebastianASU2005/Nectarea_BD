const express = require('express');
const router = express.Router();
const proyectoController = require('../controllers/proyecto.controller');
const authMiddleware = require('../middleware/auth.middleware');

// Rutas para administradores
router.post('/', authMiddleware.authenticate, authMiddleware.authorizeAdmin, proyectoController.create);
router.get('/', authMiddleware.authenticate, authMiddleware.authorizeAdmin, proyectoController.findAll);
// Usa findById para que los administradores puedan ver proyectos eliminados
router.get('/:id', authMiddleware.authenticate, authMiddleware.authorizeAdmin, proyectoController.findById);
router.put('/:id', authMiddleware.authenticate, authMiddleware.authorizeAdmin, proyectoController.update);
router.delete('/:id', authMiddleware.authenticate, authMiddleware.authorizeAdmin, proyectoController.softDelete);

// Rutas para usuarios
router.get('/activos', authMiddleware.authenticate, proyectoController.findAllActivo);
router.get('/mis_proyectos', authMiddleware.authenticate, proyectoController.findMyProjects);
// Usa findByIdActivo para que los usuarios solo puedan ver proyectos activos
router.get('/:id', authMiddleware.authenticate, proyectoController.findByIdActivo);

module.exports = router;