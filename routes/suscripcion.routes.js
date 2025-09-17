const express = require('express');
const router = express.Router();
const suscripcionController = require('../controllers/suscripcion.controller');
const authMiddleware = require('../middleware/auth.middleware');

// Ruta para que un usuario cancele su propia suscripción
router.put('/:id/cancelar', authMiddleware.authenticate, suscripcionController.cancel);

module.exports = router;
