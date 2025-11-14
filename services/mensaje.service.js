const Mensaje = require("../models/mensaje");
const Usuario = require("../models/usuario");
const { Op } = require("sequelize");

const SYSTEM_USER_ID = 2; // ID reservado para el Usuario Sistema (mensajes automáticos).

/**
 * @typedef {object} MensajeData
 * @property {number} id_remitente - ID del usuario que envía.
 * @property {number} id_receptor - ID del usuario que recibe.
 * @property {string} contenido - Cuerpo del mensaje.
 * @property {string} asunto - Asunto del mensaje.
 * @property {boolean} [leido] - Estado de lectura (por defecto: false).
 * @property {Date} [fecha_envio] - Fecha de envío (por defecto: NOW()).
 */

/**
 * Servicio de lógica de negocio para la gestión de Mensajes Internos entre usuarios y el sistema.
 */
const mensajeService = {
  /**
   * @async
   * @function obtenerPorUsuario
   * @description Obtiene todos los mensajes (enviados y recibidos) de un usuario específico.
   * @param {number} userId - ID del usuario.
   * @returns {Promise<Mensaje[]>} Lista de mensajes, incluyendo la información de los modelos asociados (remitente y receptor).
   */
  async obtenerPorUsuario(userId) {
    return Mensaje.findAll({
      where: {
        // El usuario puede ser el remitente O el receptor (vista de su buzón completo).
        [Op.or]: [{ id_remitente: userId }, { id_receptor: userId }],
      },
      order: [["fecha_envio", "ASC"]], // Ordenar cronológicamente ascendente (conversación).
      include: [
        {
          model: Usuario,
          as: "remitente", // Incluir el modelo de Usuario asociado como remitente
        },
        {
          model: Usuario,
          as: "receptor", // Incluir el modelo de Usuario asociado como receptor
        },
      ],
    });
  }
  /**
   * @async
   * @function crear
   * @description Crea un nuevo mensaje entre usuarios.
   * @param {MensajeData} data - Datos del mensaje a crear.
   * @returns {Promise<Mensaje>} El mensaje creado.
   */,

  async crear(data) {
    // La validación de que el remitente corresponde al usuario autenticado debe ocurrir en la capa del controlador.
    return Mensaje.create(data);
  }
  /**
   * @async
   * @function enviarMensajeSistema
   * @description Envía un mensaje automático con el `SYSTEM_USER_ID` como remitente.
   * @param {number} id_receptor - ID del usuario objetivo.
   * @param {string} contenido - Contenido del mensaje.
   * @returns {Promise<Mensaje>} El mensaje del sistema creado.
   */,

  async enviarMensajeSistema(id_receptor, contenido) {
    return Mensaje.create({
      id_remitente: SYSTEM_USER_ID,
      id_receptor: id_receptor,
      contenido: contenido,
      asunto: "NOTIFICACIÓN DEL SISTEMA",
      leido: false,
      fecha_envio: new Date(),
    });
  }
  /**
   * @async
   * @function contarNoLeidos
   * @description Cuenta el número de mensajes no leídos dirigidos a un usuario específico.
   * @param {number} userId - ID del usuario receptor.
   * @returns {Promise<number>} Conteo de mensajes pendientes de lectura.
   */,

  async contarNoLeidos(userId) {
    return Mensaje.count({
      where: {
        id_receptor: userId,
        leido: false, // Solo contar los que tienen la bandera 'leido' en false.
      },
    });
  }
  /**
   * @async
   * @function obtenerConversacion
   * @description Obtiene todos los mensajes intercambiados exclusivamente entre dos usuarios (chat privado).
   * @param {number} userId1 - Primer ID de usuario.
   * @param {number} userId2 - Segundo ID de usuario.
   * @returns {Promise<Mensaje[]>} Historial de conversación ordenado cronológicamente.
   */,

  async obtenerConversacion(userId1, userId2) {
    return Mensaje.findAll({
      where: {
        // Filtra mensajes donde el par (Remitente, Receptor) es (1, 2) o (2, 1).
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
      order: [["fecha_envio", "ASC"]], // Ordenar para visualizar el historial.
    });
  }
  /**
   * @async
   * @function marcarComoLeido
   * @description Marca un mensaje específico como leído. Requiere que el `userId` sea el receptor del mensaje (Restricción de seguridad).
   * @param {number} mensajeId - ID del mensaje a marcar.
   * @param {number} userId - ID del usuario autenticado que realiza la acción (debe ser el receptor).
   * @returns {Promise<Mensaje|null>} El mensaje actualizado con `leido: true` o el mensaje sin cambios si no aplica.
   */,

  async marcarComoLeido(mensajeId, userId) {
    const mensaje = await Mensaje.findOne({
      where: {
        id: mensajeId,
        id_receptor: userId, // **Garantiza que solo el receptor pueda marcarlo como leído.**
      },
    });

    if (mensaje && !mensaje.leido) {
      return mensaje.update({
        leido: true,
      });
    }

    return mensaje; // Retorna el mensaje original si ya estaba leído o no fue encontrado.
  }
  /**
   * @async
   * @function findById
   * @description Obtiene un mensaje por su clave primaria.
   * @param {number} id - ID del mensaje.
   * @returns {Promise<Mensaje|null>} El mensaje encontrado.
   */,

  async findById(id) {
    return Mensaje.findByPk(id);
  },
};

module.exports = mensajeService;
