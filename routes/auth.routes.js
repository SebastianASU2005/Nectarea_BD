const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');

// Ruta para el registro de nuevos usuarios
router.post('/register', authController.register);

// Nueva ruta para el inicio de sesión
router.post('/login', authController.login);

// Nueva ruta para confirmar el correo electrónico
// La URL contiene un parámetro dinámico (:token)
router.get('/confirmar_email/:token', authController.confirmarEmail);

module.exports = router;
