const cron = require("node-cron");
const usuarioService = require("../services/usuario.service");

// ✅ Tarea programada para eliminar permanentemente las cuentas de usuario no confirmadas.
const cleanupUnconfirmedUsersTask = {
  // ⏰ HORARIO DE PRODUCCIÓN RESTAURADO: Se ejecuta todos los días a las 3:30 AM.
  job: cron.schedule(
    "30 3 * * *", // Minuto 30, Hora 3 (3:30 AM)
    async () => {
      console.log(
        "Iniciando el proceso de limpieza de cuentas de usuario no confirmadas..."
      ); // 🛡️ PERIODO DE GRACIA RESTAURADO: Solo elimina cuentas no confirmadas con más de 7 días de antigüedad.
      const DAYS_GRACE = 7;
      try {
        // Llama al servicio para eliminar cuentas no confirmadas
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
      scheduled: false,
    }
  ),

  start() {
    this.job.start();
    console.log(
      "Cron job de limpieza de usuarios no confirmados programado para ejecutarse diariamente a las 3:30 AM."
    );
  },
};

module.exports = cleanupUnconfirmedUsersTask;
