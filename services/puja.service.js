const Puja = require('../models/puja');
const Lote = require('../models/lote');
const SuscripcionProyecto = require('../models/suscripcion_proyecto');
const { Op } = require('sequelize');
const { sequelize } = require('../config/database'); // Importamos sequelize para las transacciones

const pujaService = {
  // Función para crear una nueva puja con validación de tokens
  async create(data) {
    const { id_usuario, id_lote } = data;
    const t = await sequelize.transaction();

    try {
      // 1. Obtener el lote para encontrar su proyecto
      const lote = await Lote.findByPk(id_lote, { transaction: t });
      if (!lote) {
        throw new Error('Lote no encontrado.');
      }
      const id_proyecto = lote.id_proyecto;

      // 2. Verificar si el usuario ya ha pujado en este lote
      const pujaExistente = await Puja.findOne({
        where: { id_usuario, id_lote },
        transaction: t
      });

      // Si no hay puja existente, esta es la primera puja del usuario, así que se consume el token
      if (!pujaExistente) {
        // Validar que el usuario tiene un token disponible para este proyecto
        const suscripcion = await SuscripcionProyecto.findOne({
          where: {
            id_usuario: id_usuario,
            id_proyecto: id_proyecto,
            tokens_disponibles: {
              [Op.gt]: 0,
            },
          },
          transaction: t,
        });

        if (!suscripcion) {
          throw new Error('No tienes tokens de subasta para este proyecto.');
        }

        // Restar el token de la suscripción
        await suscripcion.decrement('tokens_disponibles', { by: 1, transaction: t });
      }

      // 3. Crear la puja
      const nuevaPuja = await Puja.create(data, { transaction: t });

      await t.commit();
      return nuevaPuja;
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },

  // Obtiene las pujas de un usuario específico
  async findByUserId(userId) {
    return Puja.findAll({
      where: {
        id_usuario: userId,
        activo: true
      }
    });
  },

  // Función para gestionar tokens después de que la subasta termina
  // Esta función debe ser llamada desde un job o un endpoint de administrador
  async gestionarTokensAlFinalizar(id_lote, id_ganador) {
    // 1. Obtener el lote para obtener el ID del proyecto
    const lote = await Lote.findByPk(id_lote);
    if (!lote) {
      console.error('Lote no encontrado.');
      return;
    }
    const id_proyecto = lote.id_proyecto;

    // 2. Encontrar a todos los usuarios que pujaron en este lote
    const pujadores = await Puja.findAll({
      where: {
        id_lote: id_lote,
      },
      attributes: [[sequelize.fn('DISTINCT', sequelize.col('id_usuario')), 'id_usuario']],
      raw: true,
    });

    // 3. Devolver los tokens a los que perdieron
    for (const pujador of pujadores) {
      if (pujador.id_usuario !== id_ganador) {
        await SuscripcionProyecto.increment('tokens_disponibles', {
          by: 1,
          where: {
            id_usuario: pujador.id_usuario,
            id_proyecto: id_proyecto,
          },
        });
      }
    }
    console.log(`Tokens devueltos a los perdedores del lote ${id_lote}.`);
  },

  // Métodos que faltaban para que el controlador funcione
  async findByIdAndUserId(id, userId) {
    return Puja.findOne({ where: { id, id_usuario: userId, activo: true } });
  },

  async updateByIdAndUserId(id, userId, data) {
    const puja = await this.findByIdAndUserId(id, userId);
    if (!puja) return null;
    return puja.update(data);
  },

  async softDeleteByIdAndUserId(id, userId) {
    const puja = await this.findByIdAndUserId(id, userId);
    if (!puja) return null;
    return puja.update({ activo: false });
  },

  // (El resto de las funciones como findAll, findById, etc. no cambian)
  async findAll() {
    return Puja.findAll();
  },

  async findAllActivo() {
    return Puja.findAll({
      where: {
        activo: true
      }
    });
  },

  async findById(id) {
    return Puja.findByPk(id);
  },

  async update(id, data) {
    const puja = await this.findById(id);
    if (!puja) {
      return null;
    }
    return puja.update(data);
  },

  async softDelete(id) {
    const puja = await this.findById(id);
    if (!puja) {
      return null;
    }
    return puja.update({ activo: false });
  }
};

module.exports = pujaService;