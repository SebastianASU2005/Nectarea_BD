const express = require('express');
const router = express.Router();
const proyectoController = require('../controllers/proyecto.controller');
const authMiddleware = require('../middleware/auth.middleware');

// Rutas para administradores
router.post('/', authMiddleware.authenticate, authMiddleware.authorizeAdmin, proyectoController.create);
router.get('/', authMiddleware.authenticate, authMiddleware.authorizeAdmin, proyectoController.findAll);
// Esta ruta de administrador debe estar al final del grupo para no interferir con las otras.
router.get('/:id', authMiddleware.authenticate, authMiddleware.authorizeAdmin, proyectoController.findById);
router.put('/:id', authMiddleware.authenticate, authMiddleware.authorizeAdmin, proyectoController.update);
router.delete('/:id', authMiddleware.authenticate, authMiddleware.authorizeAdmin, proyectoController.softDelete);

// Rutas para usuarios
router.get('/activos', authMiddleware.authenticate, proyectoController.findAllActivo);
router.get('/mis_proyectos', authMiddleware.authenticate, proyectoController.findMyProjects);
// Esta ruta de usuario genérica para buscar por ID activo
// Debe ir después de las rutas más específicas de usuario.
router.get('/:id/activo', authMiddleware.authenticate, proyectoController.findByIdActivo);


module.exports = router;