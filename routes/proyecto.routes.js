// routes/proyecto.routes.js

const express = require('express');
const router = express.Router();
const proyectoController = require('../controllers/proyecto.controller');
const authMiddleware = require('../middleware/auth.middleware');

// Ruta protegida para administradores: Solo los administradores pueden crear un proyecto
router.post('/', authMiddleware.authenticate, authMiddleware.authorizeAdmin, proyectoController.create);

// Rutas protegidas para administradores: Solo los administradores pueden ver TODOS los proyectos
router.get('/', authMiddleware.authenticate, authMiddleware.authorizeAdmin, proyectoController.findAll);

// Ruta protegida: Solo usuarios autenticados pueden ver los proyectos activos
router.get('/activos', authMiddleware.authenticate, proyectoController.findAllActivo);

// NUEVA RUTA: Solo un usuario autenticado puede ver los proyectos asociados a su propio ID.
// No necesita el ID en la URL porque lo obtendremos del token.
router.get('/mis_proyectos', authMiddleware.authenticate, proyectoController.findMyProjects);

// Ruta protegida: Solo usuarios autenticados pueden ver un proyecto específico
router.get('/:id', authMiddleware.authenticate, proyectoController.findById);

// Rutas protegidas para administradores: Solo los administradores pueden actualizar o "eliminar" proyectos
router.put('/:id', authMiddleware.authenticate, authMiddleware.authorizeAdmin, proyectoController.update);
router.delete('/:id', authMiddleware.authenticate, authMiddleware.authorizeAdmin, proyectoController.softDelete);

module.exports = router;