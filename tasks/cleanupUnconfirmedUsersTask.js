const cron = require("node-cron");
const usuarioService = require("../services/usuario.service");

/**
 * Tarea programada para eliminar permanentemente las cuentas de usuario no confirmadas.
 */
const cleanupUnconfirmedUsersTask = {
  // Configura la tarea CRON
  job: cron.schedule(
    "30 3 * * *", // CRON: Minuto 30, Hora 3 (3:30 AM), todos los días.
    async () => {
      console.log(
        "Iniciando el proceso de limpieza de cuentas de usuario no confirmadas..."
      );

      // Días de gracia: define la antigüedad mínima para que una cuenta sea elegible para eliminación.
      const DAYS_GRACE = 7;

      try {
        // Llama al servicio para eliminar cuentas no confirmadas con más de DAYS_GRACE días.
        const deletedCount = await usuarioService.cleanUnconfirmedAccounts(
          DAYS_GRACE
        );

        if (deletedCount > 0) {
          console.log(
            `Limpieza de usuarios completada: Se eliminaron ${deletedCount} cuentas no confirmadas con más de ${DAYS_GRACE} días.`
          );
        } else {
          console.log(
            "Limpieza de usuarios completada: No se encontraron cuentas no confirmadas para eliminar."
          );
        }
      } catch (error) {
        console.error(
          "❌ ERROR en el cron job de limpieza de usuarios:",
          error.message
        );
      }
    },
    {
      scheduled: false, // La tarea debe iniciarse manualmente usando .start()
    }
  ),

  /**
   * @function start
   * @description Inicia la tarea CRON.
   */
  start() {
    this.job.start();
    console.log(
      "Cron job de limpieza de usuarios no confirmados programado para ejecutarse diariamente a las 3:30 AM."
    );
  },
};

module.exports = cleanupUnconfirmedUsersTask;
