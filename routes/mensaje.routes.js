const express = require("express");
const router = express.Router();
const mensajeController = require("../controllers/mensaje.controller");
const authMiddleware = require("../middleware/auth.middleware");

// ===============================================
// 1. RUTAS ESTÁTICAS Y CON PREFIJO (DEBEN IR PRIMERO)
// ===============================================

// Obtiene todos los mensajes del usuario autenticado (Ruta raíz estática)
router.get(
  "/",
  authMiddleware.authenticate,
  mensajeController.obtenerMisMensajes
);

// Ruta para enviar un nuevo mensaje (Ruta estática POST)
router.post("/", authMiddleware.authenticate, mensajeController.enviarMensaje);

// ✅ RUTA CORREGIDA: Conteo de mensajes no leídos (¡DEBE ir antes de /:id_receptor!)
router.get(
  "/no_leidos",
  authMiddleware.authenticate,
  mensajeController.obtenerConteoNoLeidos
);

// Ruta para marcar un mensaje como leído (Ruta semi-dinámica con prefijo fijo 'leido')
router.put(
  "/leido/:id",
  authMiddleware.authenticate,
  mensajeController.marcarComoLeido
);

// ===============================================
// 2. RUTAS DINÁMICAS GENÉRICAS (DEBEN IR AL FINAL)
// ===============================================

// Ruta para obtener la conversación con otro usuario (Ruta dinámica genérica, va al final)
router.get(
  "/:id_receptor",
  authMiddleware.authenticate,
  mensajeController.obtenerConversacion
);

module.exports = router;
