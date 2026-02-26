const cron = require("node-cron");

// ✅ ELIMINADOS los requires del top-level - se cargan dentro de la función
// para evitar el ciclo: puja.routes → puja.controller → puja.service → lote.service → ManejoImpagoPuja → puja.service

const checkExpiredBids = async () => {
  // ✅ Requires dinámicos: se resuelven DESPUÉS de que todos los módulos se cargaron
  const PujaService = require("../services/puja.service");
  const LoteService = require("../services/lote.service");

  const TASK_NAME = "ManejoImpagoPuja";
  console.log(
    `[CRON - ${TASK_NAME}] Iniciando verificación de pujas vencidas: ${new Date().toLocaleString(
      "es-AR",
      { timeZone: "America/Argentina/Mendoza" },
    )}`,
  );

  try {
    const pujasVencidas = await PujaService.findExpiredGanadoraPendiente();

    if (pujasVencidas.length === 0) {
      console.log(
        `[CRON - ${TASK_NAME}] ✅ No se encontraron pujas vencidas. Sistema OK.`,
      );
      return;
    }

    console.log(
      `[CRON - ${TASK_NAME}] ⚠️  Se encontraron ${pujasVencidas.length} puja(s) vencida(s).`,
    );

    const lotesAProcesar = [
      ...new Set(pujasVencidas.map((puja) => puja.id_lote)),
    ];

    console.log(
      `[CRON - ${TASK_NAME}] 📋 Total de lotes a procesar: ${lotesAProcesar.length}`,
    );

    for (const loteId of lotesAProcesar) {
      try {
        console.log(
          `[CRON - ${TASK_NAME}] 🔄 Procesando impago para Lote ID: ${loteId}...`,
        );
        await LoteService.procesarImpagoLote(loteId);
        console.log(
          `[CRON - ${TASK_NAME}] ✅ Lote ${loteId} procesado exitosamente.`,
        );
      } catch (error) {
        console.error(
          `[CRON - ${TASK_NAME}] ❌ ERROR al procesar Lote ID ${loteId}:`,
          error.message,
        );
      }
    }

    console.log(
      `[CRON - ${TASK_NAME}] 🏁 Verificación de impagos finalizada: ${new Date().toLocaleString(
        "es-AR",
        { timeZone: "America/Argentina/Mendoza" },
      )}`,
    );
  } catch (error) {
    console.error(
      `[CRON - ${TASK_NAME}] ❌ ERROR CRÍTICO al obtener pujas vencidas:`,
      error.message,
    );
  }
};

const startCronJobs = () => {
  cron.schedule("0 1 * * *", checkExpiredBids, {
    scheduled: true,
    timezone: "America/Argentina/Mendoza",
  });

  console.log(
    "✅ [CRON] Tarea 'ManejoImpagoPuja' programada exitosamente (1:00 AM diario - Zona horaria: America/Argentina/Mendoza)",
  );
};

module.exports = { startCronJobs, checkExpiredBids };
