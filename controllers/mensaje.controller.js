const mensajeService = require('../services/mensaje.service');
const { Op } = require('sequelize');

const mensajeController = {
  // **NUEVA FUNCIÓN**: Obtiene todos los mensajes de un usuario
  async obtenerMisMensajes(req, res) {
    try {
      const userId = req.user.id;
      const mensajes = await mensajeService.obtenerPorUsuario(userId);
      res.status(200).json(mensajes);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async enviarMensaje(req, res) {
    try {
      const remitente_id = req.user.id;
      const { id_receptor, contenido } = req.body;
      const nuevoMensaje = await mensajeService.crear({
        id_remitente: remitente_id,
        id_receptor,
        contenido
      });
      res.status(201).json(nuevoMensaje);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  async obtenerConteoNoLeidos(req, res) {
    try {
      const userId = req.user.id;
      const conteo = await mensajeService.contarNoLeidos(userId);
      res.status(200).json({ conteo });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async obtenerConversacion(req, res) {
    try {
      const userId = req.user.id;
      const { id_receptor } = req.params;
      const conversacion = await mensajeService.obtenerConversacion(userId, id_receptor);
      res.status(200).json(conversacion);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async marcarComoLeido(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      const mensaje = await mensajeService.marcarComoLeido(id, userId);
      if (!mensaje) {
        return res.status(404).json({ error: 'Mensaje no encontrado o no autorizado.' });
      }
      res.status(200).json(mensaje);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
};

module.exports = mensajeController;