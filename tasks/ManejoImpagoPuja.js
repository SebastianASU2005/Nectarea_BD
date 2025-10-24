// Archivo: cron.js (o scheduler.js)

const cron = require("node-cron");
const PujaService = require("../services/puja.service");
const LoteService = require("../services/lote.service");
const { sequelize } = require("../config/database");

/**
 * Función que encapsula la lógica de manejo de impagos de pujas.
 */
const checkExpiredBids = async () => {
  const TASK_NAME = "ManejoImpagoPuja";
  console.log(
    `[CRON - ${TASK_NAME}] Iniciando verificación de pujas vencidas en: ${new Date().toLocaleString()}`
  );

  let t; // Variable para almacenar la transacción de Sequelize
  try {
    // 1. Obtiene todas las pujas en estado 'ganadora_pendiente' cuya fecha límite de pago ha vencido.
    const pujasVencidas = await PujaService.findExpiredGanadoraPendiente();

    if (pujasVencidas.length === 0) {
      console.log(
        `[CRON - ${TASK_NAME}] No se encontraron pujas vencidas. Terminando.`
      );
      return;
    }

    console.log(
      `[CRON - ${TASK_NAME}] Se encontraron ${pujasVencidas.length} lotes con pago vencido.`
    );

    // Crea una lista única de IDs de lote para evitar procesar el mismo lote varias veces.
    const lotesAProcesar = [
      ...new Set(pujasVencidas.map((puja) => puja.id_lote)),
    ];

    for (const loteId of lotesAProcesar) {
      // Inicia una transacción para cada lote para garantizar la atomicidad.
      t = await sequelize.transaction();
      try {
        console.log(
          `[CRON - ${TASK_NAME}] Procesando impago para Lote ID: ${loteId}`
        );

        // 2. Ejecuta la lógica central del servicio para manejar el impago (reasignar o limpiar).
        const result = await LoteService.handleImpago(loteId, t);

        await t.commit(); // Confirma la transacción si la operación fue exitosa.

        // 3. Registra el resultado de la operación (reasignación o limpieza).
        if (result.type === "reasignacion") {
          console.log(
            `[CRON - ${TASK_NAME} OK] Lote ${loteId} reasignado a la Puja ID: ${result.nuevaPujaId}.`
          );
          // Comentario de notificación mantenido para contexto.
          // Aquí se notificaría al usuario incumplidor y al nuevo ganador.
        } else if (result.type === "limpieza") {
          console.log(
            `[CRON - ${TASK_NAME} OK] Lote ${loteId} limpiado y listo para reingreso. Límite de 3 intentos alcanzado.`
          );
        }
      } catch (error) {
        if (t) await t.rollback(); // Revierte si hay un error en el lote específico.
        console.error(
          `[CRON - ${TASK_NAME} ERROR] Fallo al procesar el Lote ID ${loteId}. Se revirtió la transacción:`,
          error.message
        );
      }
    }

    console.log(`[CRON - ${TASK_NAME}] Verificación de impagos finalizada.`);
  } catch (error) {
    // Captura errores al inicio (obtener pujas) o errores de inicialización.
    console.error(
      `[CRON - ${TASK_NAME} ERROR GLOBAL] Fallo al obtener pujas vencidas o al inicializar:`,
      error.message
    );
  }
};

/**
 * Inicializa y programa la tarea cron.
 */
const startCronJobs = () => {
  // CRON: A la 1:00 AM, todos los días.
  cron.schedule("0 1 * * *", checkExpiredBids, {
    scheduled: true,
    timezone: "America/Argentina/Mendoza", // Asegura la ejecución a la hora local.
  });

  console.log(
    "Servicio de Cron Jobs iniciado. Tarea 'ManejoImpagoPuja' programada para la 1:00 AM."
  );
};

// Exporta las funciones para la inicialización y ejecución manual.
module.exports = { startCronJobs, checkExpiredBids };
