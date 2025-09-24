const express = require('express');
const router = express.Router();
const proyectoController = require('../controllers/proyecto.controller');
const authMiddleware = require('../middleware/auth.middleware');

// Rutas de usuario - ¡Estas deben ir primero para evitar conflictos!
router.get('/activos', authMiddleware.authenticate, proyectoController.findAllActivo);
router.get('/mis_proyectos', authMiddleware.authenticate, proyectoController.findMyProjects);
router.get('/:id/activo', authMiddleware.authenticate, proyectoController.findByIdActivo);

// ---

// Rutas para administradores (CRUD)
// Las rutas que no tienen parámetros genéricos pueden ir al inicio
router.post('/', authMiddleware.authenticate, authMiddleware.authorizeAdmin, proyectoController.create);
router.get('/', authMiddleware.authenticate, authMiddleware.authorizeAdmin, proyectoController.findAll);

// Las rutas genéricas con :id deben ir al final del archivo para no "capturar" las anteriores.
router.get('/:id', authMiddleware.authenticate, authMiddleware.authorizeAdmin, proyectoController.findById);
router.put('/:id', authMiddleware.authenticate, authMiddleware.authorizeAdmin, proyectoController.update);
router.delete('/:id', authMiddleware.authenticate, authMiddleware.authorizeAdmin, proyectoController.softDelete);

module.exports = router;