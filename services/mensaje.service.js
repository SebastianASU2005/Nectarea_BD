const Mensaje = require('../models/mensaje');
const Usuario = require('../models/usuario');
const { Op } = require('sequelize');

const mensajeService = {
  // **NUEVA FUNCIÓN**: Obtiene todos los mensajes enviados y recibidos por un usuario
  async obtenerPorUsuario(userId) {
    return Mensaje.findAll({
      where: {
        [Op.or]: [{
          id_remitente: userId
        }, {
          id_receptor: userId
        }]
      },
      order: [
        ['fecha_envio', 'ASC']
      ],
      include: [{
        model: Usuario,
        as: 'remitente'
      }, {
        model: Usuario,
        as: 'receptor'
      }]
    });
  },

  async crear(data) {
    return Mensaje.create(data);
  },

  async contarNoLeidos(userId) {
    return Mensaje.count({
      where: {
        id_receptor: userId,
        leido: false
      }
    });
  },

  async obtenerConversacion(userId1, userId2) {
    return Mensaje.findAll({
      where: {
        [Op.or]: [{
          id_remitente: userId1,
          id_receptor: userId2
        }, {
          id_remitente: userId2,
          id_receptor: userId1
        }, ],
      },
      order: [
        ['fecha_envio', 'ASC']
      ],
    });
  },

  async marcarComoLeido(mensajeId, userId) {
    const mensaje = await Mensaje.findOne({
      where: {
        id: mensajeId,
        id_receptor: userId, // Solo el receptor puede marcar el mensaje como leído
      },
    });

    if (mensaje && !mensaje.leido) {
      return mensaje.update({
        leido: true
      });
    }

    return mensaje;
  },

  async findById(id) {
    return Mensaje.findByPk(id);
  },
};

module.exports = mensajeService;