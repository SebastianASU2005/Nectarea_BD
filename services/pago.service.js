const Pago = require('../models/pago');
const SuscripcionProyecto = require('../models/suscripcion_proyecto');
const Usuario = require('../models/usuario');
const Proyecto = require('../models/proyecto');
const emailService = require('./email.service');
const { sequelize } = require('../config/database');

const pagoService = {
  // Obtiene todos los pagos
  async findAll() {
    return Pago.findAll();
  },

  // Obtiene un pago por su ID
  async findById(id) {
    return Pago.findByPk(id);
  },
  
  // Obtiene los pagos de un usuario específico
  async findByUserId(id_usuario) {
    // Primero, encuentra las suscripciones del usuario
    const suscripciones = await SuscripcionProyecto.findAll({
      where: { id_usuario: id_usuario },
      attributes: ['id']
    });

    if (suscripciones.length === 0) {
      return [];
    }

    // Luego, busca todos los pagos asociados a esas suscripciones
    const suscripcionIds = suscripciones.map(susc => susc.id);
    return Pago.findAll({
      where: { id_suscripcion: suscripcionIds }
    });
  },

  // Confirma un pago (simula la acción de una pasarela de pago)
  async markAsPaid(pagoId) {
    const t = await sequelize.transaction();
    try {
      const pago = await Pago.findByPk(pagoId, { transaction: t });

      if (!pago) {
        throw new Error('Pago no encontrado.');
      }

      await pago.update({ estado_pago: 'pagado', fecha_pago: new Date() }, { transaction: t });
      
      const suscripcion = await SuscripcionProyecto.findByPk(pago.id_suscripcion, { transaction: t });
      if (!suscripcion) throw new Error('Suscripción no encontrada.');

      const usuario = await Usuario.findByPk(suscripcion.id_usuario, { transaction: t });
      if (!usuario) throw new Error('Usuario no encontrado.');

      const proyecto = await Proyecto.findByPk(suscripcion.id_proyecto, { transaction: t });
      if (!proyecto) throw new Error('Proyecto no encontrado.');

      const subject = `Confirmación de Pago Recibido: ${proyecto.nombre_proyecto}`;
      const text = `Hola ${usuario.nombre},\n\nHemos recibido tu pago de $${pago.monto} para la suscripción al proyecto "${proyecto.nombre_proyecto}".\n\n¡Gracias por tu apoyo!`;

      await emailService.sendEmail(usuario.email, subject, text);

      await t.commit();
      return pago;

    } catch (error) {
      await t.rollback();
      throw error;
    }
  },

  // Agregado: Actualiza un pago
  async update(id, data) {
    const pago = await this.findById(id);
    if (!pago) {
      return null;
    }
    return pago.update(data);
  },

  // Agregado: "Elimina" un pago (soft delete)
  async softDelete(id) {
    const pago = await this.findById(id);
    if (!pago) {
      return null;
    }
    return pago.update({ activo: false });
  }
};

module.exports = pagoService;
