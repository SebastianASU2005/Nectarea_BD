const cron = require("node-cron");
const pagoService = require("../services/pago.service");

/**
 * Tarea programada para eliminar permanentemente los pagos cancelados de la base de datos.
 */
const cleanupCanceledPaymentsTask = {
  // Configura la tarea CRON
  job: cron.schedule(
    "0 3 * * *", // CRON: Se ejecuta todos los días a las 3:00 AM (Minuto 0, Hora 3).
    async () => {
      console.log("Iniciando el proceso de limpieza de pagos cancelados...");
      try {
        // Llama al servicio para ejecutar la lógica de eliminación.
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
      scheduled: false, // La tarea requiere una llamada explícita a .start()
    }
  ),

  /**
   * @function start
   * @description Inicia la tarea CRON programada.
   */
  start() {
    this.job.start();
    console.log(
      "Cron job de limpieza de pagos cancelados programado para ejecutarse diariamente a las 3:00 AM."
    );
  },
};

module.exports = cleanupCanceledPaymentsTask;
