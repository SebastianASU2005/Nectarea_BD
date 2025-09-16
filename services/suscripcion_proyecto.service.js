const { sequelize } = require('../config/database');
const SuscripcionProyecto = require('../models/suscripcion_proyecto');
const Pago = require('../models/pago');
const Proyecto = require('../models/proyecto');
const { getNextMonthDate } = require('../utils/dates');

const suscripcionProyectoService = {
  // Crea una nueva suscripción y su primer pago
  async create(data) {
    const t = await sequelize.transaction();
    try {
      const proyecto = await Proyecto.findByPk(data.id_proyecto, { transaction: t });

      if (!proyecto) {
        throw new Error('Proyecto no encontrado.');
      }

      const nuevaSuscripcion = await SuscripcionProyecto.create(data, { transaction: t });

      // **CAMBIO AQUÍ**: Usamos el monto_inversion del proyecto
      if (proyecto.tipo_inversion === 'mensual') {
        await Pago.create({
          id_suscripcion: nuevaSuscripcion.id,
          monto: proyecto.monto_inversion, // <-- El monto se toma del proyecto
          fecha_vencimiento: getNextMonthDate(),
          estado_pago: 'pendiente',
          mes: 1,
        }, { transaction: t });

        await Proyecto.increment('suscripciones_actuales', { by: 1, where: { id: data.id_proyecto }, transaction: t });

        await proyecto.reload({ transaction: t });
        if (proyecto.suscripciones_actuales >= proyecto.obj_suscripciones) {
          await proyecto.update({ estado_proyecto: 'En proceso' }, { transaction: t });
        }
      }
      
      await t.commit();
      return nuevaSuscripcion;

    } catch (error) {
      await t.rollback();
      throw error;
    }
  },

  // **NUEVA FUNCIÓN**: Encuentra suscripciones por el ID de un usuario
  async findByUserId(userId) {
    return SuscripcionProyecto.findAll({
      where: {
        id_usuario: userId,
        activo: true
      },
    });
  },

  async findAll() {
    return SuscripcionProyecto.findAll();
  },

  async findAllActivo() {
    return SuscripcionProyecto.findAll({
      where: {
        activo: true
      }
    });
  },

  async findById(id) {
    return SuscripcionProyecto.findByPk(id);
  },

  async softDelete(id) {
    const suscripcion = await this.findById(id);
    if (!suscripcion) {
      return null;
    }
    return suscripcion.update({ activo: false });
  }
};

module.exports = suscripcionProyectoService;