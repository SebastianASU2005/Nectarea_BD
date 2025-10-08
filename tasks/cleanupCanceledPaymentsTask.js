const cron = require("node-cron");
const pagoService = require("../services/pago.service");

// Tarea programada para eliminar permanentemente los pagos cancelados.
const cleanupCanceledPaymentsTask = {
  // Se ejecuta todos los días a las 3:00 AM (0 3 * * *)
  job: cron.schedule(
    "0 3 * * *",
    async () => {
      console.log("Iniciando el proceso de limpieza de pagos cancelados...");
      try {
        const deletedCount = await pagoService.deleteCanceledPayments();

        if (deletedCount > 0) {
          console.log(
            `Limpieza completada: Se eliminaron ${deletedCount} pagos cancelados.`
          );
        } else {
          console.log(
            "Limpieza completada: No se encontraron pagos cancelados para eliminar."
          );
        }
      } catch (error) {
        console.error(
          "Error en el cron job de limpieza de pagos:",
          error.message
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
      "Cron job de limpieza de pagos cancelados programado para ejecutarse diariamente a las 3:00 AM."
    );
  },
};

module.exports = cleanupCanceledPaymentsTask;
