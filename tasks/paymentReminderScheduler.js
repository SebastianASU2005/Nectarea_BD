// Archivo: paymentReminderScheduler.js

// Librerías de terceros
const cron = require("node-cron");

// Servicios de la aplicación
const PagoService = require("../services/pago.service");
const MensajeService = require("../services/mensaje.service");
const emailService = require("../services/email.service"); // Importado

// Configuración y Modelos
const { email_empresa } = require("../config/config");
const Proyecto = require("../models/proyecto");
const SuscripcionProyectoService = require("../services/suscripcion_proyecto.service");
const { Op, Sequelize } = require("sequelize");

const paymentReminderScheduler = {
  /**
   * @function scheduleJobs
   * @description Configura y programa las tareas CRON.
   */
  scheduleJobs() {
    // Tarea de recordatorios: Se ejecuta a las 9:20 AM (9:20). AJUSTA ESTO A TU HORARIO DE PRUEBA
    cron.schedule(
      "28 09 * * *", // CRON ACTUAL: 9:27 AM. Por favor, ajústalo al próximo minuto para probar.
      async () => {
        console.log("--- Ejecutando tarea de recordatorios de pago ---");
        await this.sendPaymentReminders();
      }
      // { timezone: "America/Argentina/Mendoza" } // Descomentar si necesitas una zona horaria específica
    );
  },

  /**
   * @async
   * @function notifyProjectGoalMet
   * @description Busca proyectos que han alcanzado su objetivo de suscripciones y notifica a los suscriptores.
   */
  async notifyProjectGoalMet() {
    // ... (Esta función no usa emailService, se mantiene igual)
    try {
      // Busca proyectos donde: suscripciones_actuales >= obj_suscripciones y objetivo_notificado es falso.
      const proyectosConObjetivoCumplido = await Proyecto.findAll({
        where: {
          suscripciones_actuales: {
            [Op.gte]: Sequelize.col("obj_suscripciones"),
          },
          objetivo_notificado: false,
        },
      });
      const remitente_id = 1; // ID fijo del sistema o remitente por defecto.

      for (const proyecto of proyectosConObjetivoCumplido) {
        // Obtiene la lista de usuarios suscriptores del proyecto.
        const suscripciones =
          await SuscripcionProyectoService.findUsersByProjectId(proyecto.id);
        const contenido = `Se ha alcanzado el objetivo de suscripciones para el proyecto "${proyecto.nombre_proyecto}". El pago mensual se empezará a generar el día 1 del mes y tendrá un vencimiento para el día 10.`;

        // Envía un mensaje interno a cada suscriptor.
        for (const suscriptor of suscripciones) {
          await MensajeService.crear({
            id_remitente: remitente_id,
            id_receptor: suscriptor.id,
            contenido: contenido,
          });
        }
        // Marca el proyecto como notificado para evitar ejecuciones futuras.
        await proyecto.update({ objetivo_notificado: true });
      }
    } catch (error) {
      console.error(
        "Error al notificar sobre el objetivo de suscripciones:",
        error
      );
    }
  },

  /**
   * @async
   * @function sendPaymentReminders
   * @description Recupera los pagos próximos a vencer y envía recordatorios por mensaje interno y correo.
   */
  async sendPaymentReminders() {
    try {
      // Obtiene los pagos que cumplen el criterio de "próximos a vencer" (definido en PagoService).
      const pagosProximosAVencer = await PagoService.findPaymentsDueSoon();
      const remitente_id = 1;

      for (const pago of pagosProximosAVencer) {
        // Verifica que todos los datos necesarios (suscripción, proyecto, usuario) estén cargados.
        if (
          pago.suscripcion &&
          pago.suscripcion.proyectoAsociado && // ✅ CORREGIDO: Usar proyectoAsociado
          pago.suscripcion.usuario
        ) {
          const nombreProyecto =
            pago.suscripcion.proyectoAsociado.nombre_proyecto;
          const montoCuota = pago.monto; // Ya usa el getter y está formateado
          const fechaVencimientoObj = new Date(pago.fecha_vencimiento);

          // Contenido para el mensaje interno (simplificado)
          const contenidoInterno = `Recordatorio: Tu pago de **$${montoCuota}** (mes ${
            pago.mes
          }) para la mensualidad de la suscripción al proyecto "${nombreProyecto}" está próximo a vencer el día **${fechaVencimientoObj.getDate()}** de este mes. ¡Evita recargos!`;

          // 1. Envía un mensaje interno al usuario.
          await MensajeService.crear({
            id_remitente: remitente_id,
            id_receptor: pago.suscripcion.id_usuario,
            contenido: contenidoInterno,
          });

          // 🟢 CAMBIO: 2. Envía correo al cliente (suscriptor) y a la empresa con una sola función
          await emailService.notificarRecordatorioPago(
            // ⬅️ FUNCIÓN ESPECÍFICA
            pago.suscripcion.usuario,
            pago.suscripcion.proyectoAsociado,
            pago,
            email_empresa
          );
          // 🟢 FIN CAMBIO
        }
      }
    } catch (error) {
      console.error("Error al enviar recordatorios de pagos:", error);
    }
  },
};

module.exports = paymentReminderScheduler;
