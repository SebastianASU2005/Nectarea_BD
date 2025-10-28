// tasks/ManejoImpagoPuja.js

const cron = require("node-cron");
const PujaService = require("../services/puja.service");
const LoteService = require("../services/lote.service");

/**
 * Función que encapsula la lógica de manejo de impagos de pujas.
 * Verifica todas las pujas vencidas, procesa cada lote afectado (hasta 3 intentos)
 * y limpia el lote para reingreso si no quedan más postores válidos.
 */
const checkExpiredBids = async () => {
  const TASK_NAME = "ManejoImpagoPuja";
  console.log(
    `[CRON - ${TASK_NAME}] Iniciando verificación de pujas vencidas: ${new Date().toLocaleString(
      "es-AR",
      { timeZone: "America/Argentina/Mendoza" }
    )}`
  );

  try {
    // 1. Obtiene todas las pujas en estado 'ganadora_pendiente' cuya fecha límite de pago ha vencido
    const pujasVencidas = await PujaService.findExpiredGanadoraPendiente();

    if (pujasVencidas.length === 0) {
      console.log(
        `[CRON - ${TASK_NAME}] ✅ No se encontraron pujas vencidas. Sistema OK.`
      );
      return;
    }

    console.log(
      `[CRON - ${TASK_NAME}] ⚠️  Se encontraron ${pujasVencidas.length} puja(s) vencida(s).`
    );

    // 2. Crea una lista única de IDs de lote para evitar procesar el mismo lote varias veces
    const lotesAProcesar = [
      ...new Set(pujasVencidas.map((puja) => puja.id_lote)),
    ];

    console.log(
      `[CRON - ${TASK_NAME}] 📋 Total de lotes a procesar: ${lotesAProcesar.length}`
    );

    // 3. Procesa cada lote individualmente
    for (const loteId of lotesAProcesar) {
      try {
        console.log(
          `[CRON - ${TASK_NAME}] 🔄 Procesando impago para Lote ID: ${loteId}...`
        );

        // 🎯 CORRECCIÓN: Usa la función correcta del servicio
        // Esta función maneja TODA la lógica:
        // - Marca la puja como incumplimiento
        // - Devuelve el token al incumplidor
        // - Notifica por email y mensaje interno
        // - Intenta reasignar al siguiente postor (P2 o P3)
        // - Si llega a 3 intentos o no hay más postores: limpia el lote para reingreso
        await LoteService.procesarImpagoLote(loteId);

        console.log(
          `[CRON - ${TASK_NAME}] ✅ Lote ${loteId} procesado exitosamente.`
        );
      } catch (error) {
        // Error aislado por lote - no detiene el procesamiento de otros lotes
        console.error(
          `[CRON - ${TASK_NAME}] ❌ ERROR al procesar Lote ID ${loteId}:`,
          error.message
        );
        console.error(`[CRON - ${TASK_NAME}] Stack trace:`, error.stack);
        // Continúa con el siguiente lote
      }
    }

    console.log(
      `[CRON - ${TASK_NAME}] 🏁 Verificación de impagos finalizada: ${new Date().toLocaleString(
        "es-AR",
        { timeZone: "America/Argentina/Mendoza" }
      )}`
    );
  } catch (error) {
    // Error crítico al inicio (ej: no se pudieron obtener las pujas)
    console.error(
      `[CRON - ${TASK_NAME}] ❌ ERROR CRÍTICO al obtener pujas vencidas:`,
      error.message
    );
    console.error(`[CRON - ${TASK_NAME}] Stack trace:`, error.stack);
  }
};

/**
 * Inicializa y programa la tarea cron.
 * Ejecuta la verificación todos los días a la 1:00 AM (hora de Argentina).
 */
const startCronJobs = () => {
  // CRON: A la 1:00 AM, todos los días
  cron.schedule("0 1 * * *", checkExpiredBids, {
    scheduled: true,
    timezone: "America/Argentina/Mendoza",
  });

  console.log(
    "✅ [CRON] Tarea 'ManejoImpagoPuja' programada exitosamente (1:00 AM diario - Zona horaria: America/Argentina/Mendoza)"
  );
};

// Exporta las funciones para inicialización y ejecución manual (testing)
module.exports = { startCronJobs, checkExpiredBids };
