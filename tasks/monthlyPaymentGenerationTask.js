const cron = require("node-cron");
const { sequelize } = require("../config/database");
const Proyecto = require("../models/proyecto");
const SuscripcionProyecto = require("../models/suscripcion_proyecto");
const Pago = require("../models/pago");
const Usuario = require("../models/usuario");
const { getNextMonthDate } = require("../utils/dates");
const emailService = require("../services/email.service");

// Objeto que contiene el job y el método para iniciarlo
const monthlyPaymentGenerationTask = {
  // Aquí se define la tarea, pero no se inicia automáticamente
  job: cron.schedule(
    "0 2 1 * *",
    async () => {
      console.log("Iniciando el proceso de generación de pagos mensuales...");
      const t = await sequelize.transaction();

      try {
        const proyectosActivos = await Proyecto.findAll({
          where: {
            estado_proyecto: "En proceso",
            tipo_inversion: "mensual",
          },
          transaction: t,
        });

        for (const proyecto of proyectosActivos) {
          const suscripciones = await SuscripcionProyecto.findAll({
            where: { id_proyecto: proyecto.id, activo: true },
            transaction: t,
          });

          if (suscripciones.length > 0) {
            const ultimoPago = await Pago.findOne({
              where: { id_suscripcion: suscripciones[0].id },
              order: [["mes", "DESC"]],
              transaction: t,
            });
            const proximoMes = ultimoPago ? ultimoPago.mes + 1 : 1; // CLAVE: La CRON corre el día 1, y genera el pago con vencimiento el día 10 del MES ACTUAL.
            const fechaVencimiento = new Date(); // Eliminamos setMonth(getMonth() + 1) para usar el mes en curso.
            fechaVencimiento.setDate(10);
            fechaVencimiento.setHours(0, 0, 0, 0);

            for (const suscripcion of suscripciones) {
              const monto = proyecto.monto_inversion;
              await Pago.create(
                {
                  id_suscripcion: suscripcion.id,
                  monto: monto,
                  fecha_vencimiento: fechaVencimiento,
                  estado_pago: "pendiente",
                  mes: proximoMes,
                },
                { transaction: t }
              );

              console.log(
                `Pago ${proximoMes} creado para la suscripción ${suscripcion.id} en el proyecto ${proyecto.id}.`
              );

              const usuario = await Usuario.findByPk(suscripcion.id_usuario, {
                transaction: t,
              });
              if (usuario && usuario.email) {
                const subject = `Recordatorio de Pago: ${proyecto.nombre_proyecto} - Mes ${proximoMes}`;
                const text = `Hola ${
                  usuario.nombre
                },\n\nTe recordamos que se ha generado tu pago mensual por un monto de $${monto} para el proyecto "${
                  proyecto.nombre_proyecto
                }".\n\nEl pago vence el ${
                  fechaVencimiento.toISOString().split("T")[0]
                }.\n\nGracias por tu apoyo.`;

                await emailService.sendEmail(usuario.email, subject, text);
              }
            }
          }
        }

        await t.commit();
        console.log("Proceso de generación de pagos completado.");
      } catch (error) {
        await t.rollback();
        console.error("Error en el cron job de pagos:", error);
      }
    },
    {
      // Aquí se mantiene en 'false' para que no se inicie solo al cargar el archivo
      scheduled: false,
    }
  ), // Método que tu app.js llamará para iniciar el cron job

  start() {
    this.job.start();
    console.log(
      "Cron job de generación de pagos mensuales programado para ejecutarse el primer día de cada mes a las 2:00 AM."
    );
  },
};

module.exports = monthlyPaymentGenerationTask;
