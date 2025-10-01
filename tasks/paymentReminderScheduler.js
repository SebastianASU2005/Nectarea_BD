const cron = require('node-cron');
const PagoService = require('../services/pago.service');
const MensajeService = require('../services/mensaje.service');
const emailService = require('../services/email.service');
const { email_empresa } = require('../config/config');
const Proyecto = require("../models/proyecto");
const { Op, Sequelize } = require("sequelize");

const paymentReminderScheduler = {
  scheduleJobs() {
    // Tarea de recordatorios de pago: se ejecuta cada día 10 de cada mes
    cron.schedule('0 0 10 * *', async () => {
      console.log('--- Ejecutando tarea de recordatorios de pago ---');
      await this.sendPaymentReminders();
    }, { timezone: 'America/Argentina/Mendoza' });
  },

  async notifyProjectGoalMet() {
    try {
      const proyectosConObjetivoCumplido = await Proyecto.findAll({
        where: {
          suscripciones_actuales: { [Op.gte]: Sequelize.col('obj_suscripciones') },
          objetivo_notificado: false,
        },
      });
      const remitente_id = 1;

      for (const proyecto of proyectosConObjetivoCumplido) {
        const suscripciones = await SuscripcionProyectoService.findUsersByProjectId(proyecto.id);
        const contenido = `Se ha alcanzado el objetivo de suscripciones para el proyecto "${proyecto.nombre_proyecto}". El pago mensual se empezará a generar el día 1 del mes y tendrá un vencimiento para el día 10.`;
        for (const suscriptor of suscripciones) {
          await MensajeService.crear({
            id_remitente: remitente_id,
            id_receptor: suscriptor.id,
            contenido: contenido,
          });
        }
        await proyecto.update({ objetivo_notificado: true });
      }
    } catch (error) {
      console.error('Error al notificar sobre el objetivo de suscripciones:', error);
    }
  },

  async sendPaymentReminders() {
    try {
      const pagosProximosAVencer = await PagoService.findPaymentsDueSoon();
      const remitente_id = 1;

      for (const pago of pagosProximosAVencer) {
        if (pago.suscripcion && pago.suscripcion.proyecto && pago.suscripcion.usuario) {
          const contenido = `Recordatorio: Tu pago para la mensualidad de la suscripción al proyecto "${pago.suscripcion.proyecto.nombre_proyecto}" está próximo a vencer el día 10 de este mes.`;
          
          await MensajeService.crear({
            id_remitente: remitente_id,
            id_receptor: pago.suscripcion.id_usuario,
            contenido: contenido
          });

          // CORREO AL CLIENTE
          const subjectCliente = `Recordatorio de Pago Próximo: ${pago.suscripcion.proyecto.nombre_proyecto}`;
          await emailService.sendEmail(pago.suscripcion.usuario.email, subjectCliente, contenido);

          // CORREO A LA EMPRESA
          const subjectEmpresa = `Notificación de Pago Próximo - ${pago.suscripcion.proyecto.nombre_proyecto}`;
          const contenidoEmpresa = `Hola equipo,\n\nSe ha enviado un recordatorio de pago al cliente ${pago.suscripcion.usuario.nombre} ${pago.suscripcion.usuario.apellido} (${pago.suscripcion.usuario.email}) para el proyecto "${pago.suscripcion.proyecto.nombre_proyecto}". El pago de $${pago.monto} vence el **${(new Date(pago.fecha_vencimiento)).toISOString().split('T')[0]}**.\n\nSaludos.`;
          await emailService.sendEmail(email_empresa, subjectEmpresa, contenidoEmpresa);
        }
      }
    } catch (error) {
      console.error('Error al enviar recordatorios de pagos:', error);
    }
  },
};

module.exports = paymentReminderScheduler;
