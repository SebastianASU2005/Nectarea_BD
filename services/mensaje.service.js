const Mensaje = require("../models/mensaje");
const Usuario = require("../models/usuario");
const { Op } = require("sequelize");

const SYSTEM_USER_ID = 2; // Asumimos que el ID 1 es el Administrador o Sistema para mensajes automáticos.

/**
 * Servicio de lógica de negocio para la gestión de Mensajes Internos.
 */
const mensajeService = {
  /**
   * @async
   * @function obtenerPorUsuario
   * @description Obtiene todos los mensajes (enviados y recibidos) de un usuario específico.
   * Incluye la información del remitente y el receptor.
   * @param {number} userId - ID del usuario.
   * @returns {Promise<Mensaje[]>} Lista de mensajes.
   */
  async obtenerPorUsuario(userId) {
    return Mensaje.findAll({
      where: {
        // Busca donde el usuario es el remitente O el receptor
        [Op.or]: [
          {
            id_remitente: userId,
          },
          {
            id_receptor: userId,
          },
        ],
      },
      order: [["fecha_envio", "ASC"]], // Ordenar cronológicamente
      include: [
        {
          model: Usuario,
          as: "remitente",
        },
        {
          model: Usuario,
          as: "receptor",
        },
      ],
    });
  },

  /**
   * @async
   * @function crear
   * @description Crea un nuevo mensaje.
   * @param {object} data - Datos del mensaje a crear.
   * @returns {Promise<Mensaje>} El mensaje creado.
   */
  async crear(data) {
    // Nota: Es importante validar en el controlador que el remitente sea el usuario autenticado.
    return Mensaje.create(data);
  },

  /**
   * @async
   * @function enviarMensajeSistema
   * @description Envía un mensaje automático con el `SYSTEM_USER_ID` como remitente.
   * @param {number} id_receptor - ID del usuario que recibe el mensaje.
   * @param {string} contenido - Contenido del mensaje.
   * @returns {Promise<Mensaje>} El mensaje del sistema creado.
   */
  async enviarMensajeSistema(id_receptor, contenido) {
    return Mensaje.create({
      id_remitente: SYSTEM_USER_ID,
      id_receptor: id_receptor,
      contenido: contenido,
      asunto: "NOTIFICACIÓN DEL SISTEMA",
      leido: false,
      fecha_envio: new Date(), // Agregar fecha de envío por defecto
    });
  },

  /**
   * @async
   * @function contarNoLeidos
   * @description Cuenta el número de mensajes no leídos para un usuario.
   * @param {number} userId - ID del usuario.
   * @returns {Promise<number>} Conteo de mensajes no leídos.
   */
  async contarNoLeidos(userId) {
    return Mensaje.count({
      where: {
        id_receptor: userId,
        leido: false,
      },
    });
  },

  /**
   * @async
   * @function obtenerConversacion
   * @description Obtiene todos los mensajes intercambiados entre dos usuarios específicos.
   * @param {number} userId1 - Primer ID de usuario.
   * @param {number} userId2 - Segundo ID de usuario.
   * @returns {Promise<Mensaje[]>} Historial de conversación ordenado.
   */
  async obtenerConversacion(userId1, userId2) {
    return Mensaje.findAll({
      where: {
        // Busca mensajes donde (Remitente=1 AND Receptor=2) OR (Remitente=2 AND Receptor=1)
        [Op.or]: [
          {
            id_remitente: userId1,
            id_receptor: userId2,
          },
          {
            id_remitente: userId2,
            id_receptor: userId1,
          },
        ],
      },
      order: [["fecha_envio", "ASC"]],
    });
  },

  /**
   * @async
   * @function marcarComoLeido
   * @description Marca un mensaje específico como leído, solo si el usuario que solicita
   * la acción es el receptor del mensaje.
   * @param {number} mensajeId - ID del mensaje a marcar.
   * @param {number} userId - ID del usuario autenticado (receptor).
   * @returns {Promise<Mensaje|null>} El mensaje actualizado o null.
   */
  async marcarComoLeido(mensajeId, userId) {
    const mensaje = await Mensaje.findOne({
      where: {
        id: mensajeId,
        id_receptor: userId, // Restricción de seguridad
      },
    });

    if (mensaje && !mensaje.leido) {
      return mensaje.update({
        leido: true,
      });
    }

    return mensaje; // Devuelve el mensaje sin cambios si ya estaba leído o no era el receptor
  },

  /**
   * @async
   * @function findById
   * @description Obtiene un mensaje por su clave primaria.
   * @param {number} id - ID del mensaje.
   * @returns {Promise<Mensaje|null>} El mensaje encontrado.
   */
  async findById(id) {
    return Mensaje.findByPk(id);
  },
};

module.exports = mensajeService;