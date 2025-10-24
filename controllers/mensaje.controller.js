const mensajeService = require("../services/mensaje.service");
const { Op } = require("sequelize"); // Importado, pero no usado directamente en el controlador

/**
 * Controlador de Express para gestionar la mensajería interna entre usuarios.
 * Incluye funcionalidades para enviar, recibir, obtener conversaciones y gestionar el estado de lectura.
 */
const mensajeController = {
  // ===================================================================
  // FUNCIONES DE LECTURA DE MENSAJES
  // ===================================================================

  /**
   * @async
   * @function obtenerMisMensajes
   * @description **NUEVA FUNCIÓN**: Obtiene todos los mensajes donde el usuario es remitente o receptor.
   * @param {object} req - Objeto de solicitud de Express (contiene `req.user.id`).
   * @param {object} res - Objeto de respuesta de Express.
   */
  async obtenerMisMensajes(req, res) {
    try {
      const userId = req.user.id;
      // Delega al servicio la lógica para obtener todos los mensajes relevantes para el usuario
      const mensajes = await mensajeService.obtenerPorUsuario(userId);
      res.status(200).json(mensajes);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  /**
   * @async
   * @function obtenerConteoNoLeidos
   * @description Obtiene el número total de mensajes no leídos para el usuario autenticado.
   * @param {object} req - Objeto de solicitud de Express (contiene `req.user.id`).
   * @param {object} res - Objeto de respuesta de Express.
   */
  async obtenerConteoNoLeidos(req, res) {
    try {
      const userId = req.user.id;
      const conteo = await mensajeService.contarNoLeidos(userId);
      res.status(200).json({ conteo });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  /**
   * @async
   * @function obtenerConversacion
   * @description Obtiene el historial de mensajes entre el usuario autenticado y otro usuario (`id_receptor`).
   * @param {object} req - Objeto de solicitud de Express (con `id_receptor` en `params` y `req.user.id`).
   * @param {object} res - Objeto de respuesta de Express.
   */
  async obtenerConversacion(req, res) {
    try {
      const userId = req.user.id;
      const { id_receptor } = req.params;
      // Delega al servicio la obtención de la conversación y el marcado de mensajes como leídos
      const conversacion = await mensajeService.obtenerConversacion(
        userId,
        id_receptor
      );
      res.status(200).json(conversacion);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // ===================================================================
  // FUNCIONES DE ESCRITURA Y ESTADO
  // ===================================================================

  /**
   * @async
   * @function enviarMensaje
   * @description Crea y envía un nuevo mensaje entre el usuario autenticado y un receptor.
   * @param {object} req - Objeto de solicitud de Express (con `id_receptor` y `contenido` en `body`).
   * @param {object} res - Objeto de respuesta de Express.
   */
  async enviarMensaje(req, res) {
    try {
      const remitente_id = req.user.id;
      const { id_receptor, contenido } = req.body;
      const nuevoMensaje = await mensajeService.crear({
        id_remitente: remitente_id,
        id_receptor,
        contenido,
      });
      res.status(201).json(nuevoMensaje);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  /**
   * @async
   * @function marcarComoLeido
   * @description Marca un mensaje específico como leído por el usuario autenticado.
   * Se requiere verificar que el usuario sea el receptor del mensaje.
   * @param {object} req - Objeto de solicitud de Express (con `id` del mensaje en `params` y `req.user.id`).
   * @param {object} res - Objeto de respuesta de Express.
   */
  async marcarComoLeido(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      // El servicio debe asegurar que el usuario sea el receptor y que el mensaje exista
      const mensaje = await mensajeService.marcarComoLeido(id, userId);
      if (!mensaje) {
        return res
          .status(404)
          .json({ error: "Mensaje no encontrado o no autorizado." });
      }
      res.status(200).json(mensaje);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
};

module.exports = mensajeController;
