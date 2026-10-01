const cron = require("node-cron");
const InversionService = require("../services/inversion.service");
const Proyecto = require("../models/proyecto");
const { Op } = require("sequelize");

const MINUTOS_ESPERA = Number(process.env.MINUTOS_ESPERA_INVERSION || 60);

async function cleanupAbandonedInvestments() {
  console.log("[CRON] Limpiando inversiones pendientes abandonadas...");

  try {
    // Traer todos los proyectos activos (los inactivos ya no importan)
    const proyectos = await Proyecto.findAll({
      where: { activo: true },
      attributes: ["id", "nombre_proyecto"],
    });

    let totalRechazadas = 0;

    for (const proyecto of proyectos) {
      try {
        const resultado =
          await InversionService.rechazarInversionesPendientesAntiguas(
            proyecto.id,
            { minutosMaximos: MINUTOS_ESPERA },
          );

        if (resultado.rechazadas > 0) {
          console.log(
            `[CRON] Proyecto ${proyecto.id} (${proyecto.nombre_proyecto}): ` +
              `${resultado.rechazadas} inversiones rechazadas.`,
          );
          totalRechazadas += resultado.rechazadas;
        }
      } catch (err) {
        console.error(
          `[CRON] Error limpiando proyecto ${proyecto.id}:`,
          err.message,
        );
      }
    }

    console.log(
      `[CRON] Limpieza completada. Total rechazadas: ${totalRechazadas}`,
    );
  } catch (error) {
    console.error("[CRON] Error general en limpieza:", error.message);
  }
}

function startCleanupAbandonedInvestments() {
  // Cada 6 horas a los :15
  cron.schedule("15 */6 * * *", cleanupAbandonedInvestments);
  console.log(
    "✅ CRON: Limpieza de inversiones abandonadas programada cada 6 horas.",
  );
}

module.exports = {
  startCleanupAbandonedInvestments,
  cleanupAbandonedInvestments,
};