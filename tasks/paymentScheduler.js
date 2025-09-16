// Archivo: tasks/paymentScheduler.js
const cron = require('node-cron');
const { sequelize } = require('../config/database');
const Proyecto = require('../models/proyecto');
const SuscripcionProyecto = require('../models/suscripcion_proyecto');
const Pago = require('../models/pago');
const Usuario = require('../models/usuario'); // **Importa el modelo de Usuario**
const { getNextMonthDate } = require('../utils/dates');
const emailService = require('../services/email.service'); // **Importa el servicio de email**

// La tarea se ejecutará el primer día de cada mes a las 2:00 AM
const job = cron.schedule('0 2 1 * *', async () => {
  console.log('Iniciando el proceso de generación de pagos mensuales...');
  const t = await sequelize.transaction();

  try {
    const proyectosActivos = await Proyecto.findAll({
      where: { 
        estado_proyecto: 'En proceso',
        tipo_inversion: 'mensual'
      },
      transaction: t,
    });

    for (const proyecto of proyectosActivos) {
      const suscripciones = await SuscripcionProyecto.findAll({
        where: { id_proyecto: proyecto.id, activo: true },
        transaction: t,
      });

      const ultimoPago = await Pago.findOne({
        where: { id_suscripcion: suscripciones[0].id },
        order: [['mes', 'DESC']],
        transaction: t,
      });
      const proximoMes = ultimoPago ? ultimoPago.mes + 1 : 2;

      for (const suscripcion of suscripciones) {
        const monto = proyecto.monto_inversion; 

        // Crea el pago
        await Pago.create({
          id_suscripcion: suscripcion.id,
          monto: monto,
          fecha_vencimiento: getNextMonthDate(),
          estado_pago: 'pendiente',
          mes: proximoMes,
        }, { transaction: t });

        console.log(`Pago ${proximoMes} creado para la suscripción ${suscripcion.id} en el proyecto ${proyecto.id}.`);

        // **Lógica para enviar la notificación por correo**
        const usuario = await Usuario.findByPk(suscripcion.id_usuario, { transaction: t });
        if (usuario && usuario.email) {
          const subject = `Recordatorio de Pago: ${proyecto.nombre_proyecto} - Mes ${proximoMes}`;
          const text = `Hola ${usuario.nombre},\n\nTe recordamos que se ha generado tu pago mensual por un monto de $${monto} para el proyecto "${proyecto.nombre_proyecto}".\n\nEl pago vence el ${getNextMonthDate()}.\n\nGracias por tu apoyo.`;

          await emailService.sendEmail(usuario.email, subject, text);
        }
      }
    }

    await t.commit();
    console.log('Proceso de generación de pagos completado.');
  } catch (error) {
    await t.rollback();
    console.error('Error en el cron job de pagos:', error);
  }
}, {
  scheduled: false,
});

module.exports = job;