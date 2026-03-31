// Archivo: cron/auctionScheduler.js

const cron = require("node-cron");
const loteService = require("../services/lote.service");
// Se elimina PujaService ya que la tarea de impagos se movió.

/**
 * Inicializa y programa todas las tareas recurrentes de la aplicación.
 */
const initAuctionScheduler = () => {
  // Tarea 1: INICIAR SUBASTAS
  // Se ejecutará una vez al día a medianoche (00:00).
  cron.schedule("0 0 * * *", async () => {
    console.log("🤖 CRON: Buscando lotes para iniciar subasta...");
    try {
      const lotesToStart = await loteService.findLotesToStart();

      for (const lote of lotesToStart) {
        // El loteService.update se encarga de cambiar el estado a 'activa'
        // y de enviar notificaciones a todos los usuarios activos.
        await loteService.update(lote.id, {
          estado_subasta: "activa",
          fecha_inicio: new Date(), // Actualizamos la hora de inicio al momento de la ejecución.
        });
        console.log(`▶️ Lote #${lote.id} (${lote.nombre_lote}) iniciado.`);
      }
    } catch (error) {
      console.error(
        "❌ Error en el CRON de inicio de subastas:",
        error.message
      );
    }
  });

  // Tarea 2: FINALIZAR SUBASTAS
  // Se ejecutará una vez al día a medianoche (00:00).
  cron.schedule("5 0 * * *", async () => {
    console.log("🤖 CRON: Buscando lotes para finalizar subasta...");
    try {
      const lotesToEnd = await loteService.findLotesToEnd();

      for (const lote of lotesToEnd) {
        // El loteService.endAuction se encarga de:
        // 1. Marcar el lote como 'finalizada'.
        // 2. Asignar el ganador potencial y el ciclo de 90 días.
        // 3. Enviar notificaciones.
        await loteService.endAuction(lote.id);
        console.log(`🏁 Lote #${lote.id} (${lote.nombre_lote}) finalizado.`);
      }
    } catch (error) {
      console.error(
        "❌ Error en el CRON de finalización de subastas:",
        error.message
      );
    }
  });

  // 🛑 Tarea 3 de Impagos ELIMINADA. Está centralizada en ManejoImpagoPuja.js

  console.log("✅ Scheduler de Subastas inicializado.");
};

module.exports = { initAuctionScheduler };
