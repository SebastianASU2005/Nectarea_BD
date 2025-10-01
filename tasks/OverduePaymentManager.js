const cron = require("node-cron");
const { sequelize } = require("../config/database");
const Pago = require("../models/pago");
const { Op } = require("sequelize");

const overduePaymentManager = {
  job: cron.schedule(
    "0 3 * * *",
    async () => {
      console.log(
        "--- Iniciando la gestión de pagos vencidos y aplicación de recargos ---"
      );
      const t = await sequelize.transaction();

      try {
        // Tasa de interés diaria (aproximadamente 4.265% mensual simple)
        const dailyInterestRate = 0.04265 / 30; // Solo buscamos pagos que siguen en estado 'pendiente' y cuya fecha de vencimiento ya pasó.

        // Esta tarea solo aplica el recargo la primera vez que detecta el vencimiento.
        const pagosPendientes = await Pago.findAll({
          where: {
            estado_pago: "pendiente",
            fecha_vencimiento: { [Op.lt]: new Date() },
          },
          transaction: t,
        });

        for (const pago of pagosPendientes) {
          const fechaVencimiento = new Date(pago.fecha_vencimiento);
          const hoy = new Date(); // Calcula los días vencidos para aplicar el recargo acumulado hasta este punto
          const diasVencidos = Math.floor(
            (hoy - fechaVencimiento) / (1000 * 60 * 60 * 24)
          );
          const recargo = pago.monto * (dailyInterestRate * diasVencidos);
          const nuevoMonto = parseFloat(pago.monto) + recargo; // Asegurar parseo a float

          await pago.update(
            {
              estado_pago: "vencido", // Se marca como 'vencido' para no ser procesado de nuevo por este query
              monto: nuevoMonto.toFixed(2),
            },
            { transaction: t }
          );
          console.log(
            `Pago ${
              pago.id
            } vencido. Se aplicó un recargo de $${recargo.toFixed(2)}.`
          );
        }

        await t.commit();
        console.log("--- Gestión de pagos vencidos completada. ---");
      } catch (error) {
        await t.rollback();
        console.error(
          "Error en el cron job de gestión de pagos vencidos:",
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
      "Cron job de pagos vencidos programado para ejecutarse todos los días a las 3:00 AM."
    );
  },
};

module.exports = overduePaymentManager;
