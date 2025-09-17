const { Op } = require('sequelize');
const Pago = require('../models/pago');
const SuscripcionProyecto = require('../models/suscripcion_proyecto');
const Usuario = require('../models/usuario');
const Proyecto = require('../models/proyecto');
const emailService = require('./email.service');
const mensajeService = require('./mensaje.service');
const { sequelize } = require('../config/database');

const pagoService = {
  async create(data) {
    return Pago.create(data);
  },

  async findAll() {
    return Pago.findAll();
  },

  async findById(id) {
    return Pago.findByPk(id);
  },
  
  async findByUserId(id_usuario) {
    const suscripciones = await SuscripcionProyecto.findAll({
      where: { id_usuario: id_usuario },
      attributes: ['id']
    });

    if (suscripciones.length === 0) {
      return [];
    }

    const suscripcionIds = suscripciones.map(susc => susc.id);
    return Pago.findAll({
      where: { id_suscripcion: suscripcionIds }
    });
  },

  async markAsPaid(pagoId) {
    const t = await sequelize.transaction();
    try {
      const pago = await Pago.findByPk(pagoId, { transaction: t, include: [{ model: SuscripcionProyecto, as: 'suscripcion', include: [{ model: Proyecto, as: 'proyecto'}, {model: Usuario, as: 'usuario'}] }] });

      if (!pago) {
        throw new Error('Pago no encontrado.');
      }

      await pago.update({ estado_pago: 'pagado', fecha_pago: new Date() }, { transaction: t });
      
      const usuario = pago.suscripcion.usuario;
      const proyecto = pago.suscripcion.proyecto;

      const subject = `Confirmación de Pago Recibido: ${proyecto.nombre_proyecto}`;
      const text = `Hola ${usuario.nombre},\n\nHemos recibido tu pago de $${pago.monto} para la suscripción al proyecto "${proyecto.nombre_proyecto}".\n\n¡Gracias por tu apoyo!`;

      await emailService.sendEmail(usuario.email, subject, text);

      const remitente_id = 1;
      const contenido = `Tu pago de $${pago.monto} para la suscripción al proyecto "${proyecto.nombre_proyecto}" ha sido procesado exitosamente. ¡Gracias!`;
      await mensajeService.crear({ 
        id_remitente: remitente_id,
        id_receptor: usuario.id,
        contenido: contenido 
      }, { transaction: t });

      await t.commit();
      return pago;

    } catch (error) {
      await t.rollback();
      throw error;
    }
  },

  async update(id, data) {
    const pago = await this.findById(id);
    if (!pago) {
      return null;
    }
    return pago.update(data);
  },

  async softDelete(id) {
    const pago = await this.findById(id);
    if (!pago) {
      return null;
    }
    return pago.update({ activo: false });
  },

  async findPaymentsDueSoon() {
    const today = new Date();
    const threeDaysFromNow = new Date();
    threeDaysFromNow.setDate(today.getDate() + 3);

    return Pago.findAll({
      where: {
        estado_pago: 'pendiente',
        fecha_vencimiento: {
          [Op.between]: [today, threeDaysFromNow]
        },
      },
      include: [{
        model: SuscripcionProyecto,
        as: 'suscripcion',
        include: [{
          model: Proyecto,
          as: 'proyecto'
        }, {
          model: Usuario,
          as: 'usuario'
        }]
      }]
    });
  },

  async findOverduePayments() {
    const today = new Date();

    return Pago.findAll({
      where: {
        estado_pago: 'pendiente',
        fecha_vencimiento: {
          [Op.lt]: today
        },
      },
      include: [{
        model: SuscripcionProyecto,
        as: 'suscripcion',
        include: [{
          model: Proyecto,
          as: 'proyecto'
        }, {
          model: Usuario,
          as: 'usuario'
        }]
      }]
    });
  },
};

module.exports = pagoService;