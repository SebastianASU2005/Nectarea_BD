const express = require('express');
const router = express.Router();
const cuotaMensualController = require('../controllers/cuota_mensual.controller');
const authMiddleware = require('../middleware/auth.middleware');

// Ruta protegida para administradores: Solo los administradores pueden crear una cuota mensual.
router.post('/', authMiddleware.authenticate, authMiddleware.authorizeAdmin, cuotaMensualController.create);

// Ruta protegida para usuarios autenticados: Permite ver todas las cuotas de un proyecto específico.
router.get('/:id_proyecto', authMiddleware.authenticate, cuotaMensualController.findByProjectId);

// Ruta protegida para usuarios autenticados: Permite ver la última cuota mensual de un proyecto.
router.get('/:id_proyecto/last', authMiddleware.authenticate, cuotaMensualController.findLastByProjectId);

// Rutas protegidas para administradores: Solo los administradores pueden actualizar o eliminar una cuota.
router.put('/:id', authMiddleware.authenticate, authMiddleware.authorizeAdmin, cuotaMensualController.update);
router.delete('/:id', authMiddleware.authenticate, authMiddleware.authorizeAdmin, cuotaMensualController.softDelete);

module.exports = router;