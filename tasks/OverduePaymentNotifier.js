const cron = require("node-cron");
const PagoService = require("../services/pago.service");
const MensajeService = require("../services/mensaje.service");
const emailService = require("../services/email.service");
const { email_empresa } = require("../config/config");

const overduePaymentNotifier = {
  job: cron.schedule(
    "0 8 */5 * *",
    async () => {
      console.log(
        "--- Iniciando el envío de notificaciones de pagos vencidos ---"
      );
      try {
        // NOTA: PagoService.findOverduePayments() debe buscar pagos en estado 'vencido' también.
        const pagosVencidos = await PagoService.findOverduePayments();
        const remitente_id = 1;

        for (const pago of pagosVencidos) {
          if (
            pago.suscripcion &&
            pago.suscripcion.proyectoAsociado &&
            pago.suscripcion.usuario
          ) {
            const contenido = `Recordatorio de pago: Tu pago para la mensualidad de la suscripción al proyecto "${
              pago.suscripcion.proyectoAsociado.nombre_proyecto
            }" del mes ${
              pago.mes
            } no se ha efectuado. Por favor, realiza el pago a la brevedad. El monto actual es de $${pago.monto.toFixed(
              2
            )}.`;

            await MensajeService.crear({
              id_remitente: remitente_id,
              id_receptor: pago.suscripcion.id_usuario,
              contenido: contenido,
            });

            const subjectCliente = `ALERTA: Pago Vencido - ${pago.suscripcion.proyectoAsociado.nombre_proyecto}`;
            await emailService.sendEmail(
              pago.suscripcion.usuario.email,
              subjectCliente,
              contenido
            );

            const subjectEmpresa = `ALERTA: Pago Vencido - ${pago.suscripcion.proyectoAsociado.nombre_proyecto}`;
            const contenidoEmpresa = `¡ALERTA! El cliente ${
              pago.suscripcion.usuario.nombre
            } ${pago.suscripcion.usuario.apellido} (${
              pago.suscripcion.usuario.email
            }) tiene un pago vencido de $${pago.monto.toFixed(
              2
            )} para el proyecto "${
              pago.suscripcion.proyectoAsociado.nombre_proyecto
            }".\n\nPor favor, denle seguimiento.`;
            await emailService.sendEmail(
              email_empresa,
              subjectEmpresa,
              contenidoEmpresa
            );
          }
        }
        console.log(
          "--- Envío de notificaciones de pagos vencidos completado. ---"
        );
      } catch (error) {
        console.error(
          "Error al enviar notificaciones de pagos vencidos:",
          error
        );
      }
    },
    {
      scheduled: false,
    }
  ),
  start() {
    this.job.start();
    console.log(
      "Cron job de notificaciones de pagos vencidos programado para ejecutarse cada 5 días a las 8:00 AM."
    );
  },
};

module.exports = overduePaymentNotifier;
