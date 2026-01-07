const { Op } = require("sequelize");
const Transaccion = require("../models/transaccion");
const PagoMercado = require("../models/pagoMercado");
const cron = require("node-cron");

const TRANSACTION_TIMEOUT_MINUTES = 30;

/**
 * @async
 * @function expirarTransaccionesAntiguas
 * @description Busca y expira todas las transacciones pendientes/fallidas antiguas
 */
async function expirarTransaccionesAntiguas() {
  const fechaLimite = new Date(
    Date.now() - TRANSACTION_TIMEOUT_MINUTES * 60 * 1000
  );

  try {
    console.log("🔍 Buscando transacciones antiguas para expirar...");

    const transaccionesAntiguas = await Transaccion.findAll({
      where: {
        estado_transaccion: {
          [Op.in]: ["pendiente", "fallido"],
        },
        createdAt: {
          [Op.lt]: fechaLimite,
        },
      },
    });

    if (transaccionesAntiguas.length === 0) {
      console.log("✅ No hay transacciones antiguas para expirar.");
      return;
    }

    console.log(
      `⏰ Expirando ${transaccionesAntiguas.length} transacciones antiguas...`
    );

    for (const transaccion of transaccionesAntiguas) {
      await transaccion.update({
        estado_transaccion: "expirado",
        error_detalle: `Auto-expirado tras ${TRANSACTION_TIMEOUT_MINUTES} minutos sin confirmación (Cron Job)`,
      });

      console.log(
        `   ✓ Transacción ${transaccion.id} expirada (creada: ${transaccion.createdAt})`
      );
    }

    console.log(
      `✅ Proceso completado: ${transaccionesAntiguas.length} transacciones expiradas.`
    );
  } catch (error) {
    console.error("❌ Error al expirar transacciones antiguas:", error.message);
  }
}

function iniciarCronJobExpiracion() {
  // 🎯 CAMBIO CRÍTICO: Ejecuta cada 2 horas (a los 0 minutos de cada dos horas)
  cron.schedule("0 */2 * * *", async () => {
    console.log("\n⏰ [CRON] Ejecutando job de expiración de transacciones...");
    await expirarTransaccionesAntiguas();
  });

  console.log(
    "✅ Cron Job de expiración de transacciones iniciado (cada 2 horas)"
  );
}

module.exports = {
  expirarTransaccionesAntiguas,
  iniciarCronJobExpiracion,
};
