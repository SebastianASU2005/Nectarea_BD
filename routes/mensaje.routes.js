const express = require('express');
const router = express.Router();
const mensajeController = require('../controllers/mensaje.controller');
const authMiddleware = require('../middleware/auth.middleware');

// **NUEVA RUTA**: Obtiene todos los mensajes del usuario autenticado
router.get('/', authMiddleware.authenticate, mensajeController.obtenerMisMensajes);

// Ruta para enviar un nuevo mensaje
router.post('/', authMiddleware.authenticate, mensajeController.enviarMensaje);

// Ruta para obtener el conteo de mensajes no leídos del usuario autenticado
router.get('/no_leidos', authMiddleware.authenticate, mensajeController.obtenerConteoNoLeidos);

// Ruta para obtener la conversación con otro usuario
router.get('/:id_receptor', authMiddleware.authenticate, mensajeController.obtenerConversacion);

// Ruta para marcar un mensaje como leído
router.put('/leido/:id', authMiddleware.authenticate, mensajeController.marcarComoLeido);

module.exports = router;