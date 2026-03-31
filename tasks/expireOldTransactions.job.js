const { Op } = require("sequelize");
const Transaccion = require("../models/transaccion");
const Pago = require("../models/pago");
const Inversion = require("../models/inversion");
const cron = require("node-cron");
const { sequelize } = require("../config/database");

const TRANSACTION_TIMEOUT_MINUTES = 30;

async function limpiarEntidadAsociada(transaccion, t) {
  const tipo = transaccion.tipo_transaccion;
  try {
    if (tipo === "pago_suscripcion_inicial" && transaccion.id_pago_mensual) {
      const pago = await Pago.findByPk(transaccion.id_pago_mensual, {
        transaction: t,
      });
      if (
        pago &&
        !["pagado", "cancelado", "cubierto_por_puja"].includes(pago.estado_pago)
      ) {
        await pago.update({ estado_pago: "cancelado" }, { transaction: t });
      }
    }

    if (tipo === "directo" && transaccion.id_inversion) {
      const inversion = await Inversion.findByPk(transaccion.id_inversion, {
        transaction: t,
      });
      if (inversion && !["pagado", "fallido"].includes(inversion.estado)) {
        await inversion.update({ estado: "fallido" }, { transaction: t });
      }
    }
  } catch (error) {
    console.error(
      `❌ Error limpiando entidades de transaccion ${transaccion.id}:`,
      error.message,
    );
    throw error;
  }
}

async function expirarTransaccionesAntiguas() {
  const fechaLimite = new Date(
    Date.now() - TRANSACTION_TIMEOUT_MINUTES * 60 * 1000,
  );

  try {
    const transaccionesAntiguas = await Transaccion.findAll({
      where: {
        estado_transaccion: { [Op.in]: ["pendiente", "fallido"] },
        createdAt: { [Op.lt]: fechaLimite },
      },
    });

    if (transaccionesAntiguas.length === 0) return;

    console.log(
      `⏰ Expirando ${transaccionesAntiguas.length} transacciones...`,
    );

    for (const transaccion of transaccionesAntiguas) {
      const t = await sequelize.transaction();
      try {
        await limpiarEntidadAsociada(transaccion, t);

        await transaccion.update(
          {
            estado_transaccion: "expirado",
            error_detalle: `Auto-expirado tras ${TRANSACTION_TIMEOUT_MINUTES} min (Cron Job)`,
          },
          { transaction: t },
        );

        await t.commit();
      } catch (err) {
        if (t) await t.rollback();
        console.error(
          `❌ Error en transaccion ${transaccion.id}:`,
          err.message,
        );
      }
    }
  } catch (error) {
    console.error("❌ Error general en cron de expiración:", error.message);
  }
}

function iniciarCronJobExpiracion() {
  // Se ejecuta cada 2 horas
  cron.schedule("0 */2 * * *", async () => {
    await expirarTransaccionesAntiguas();
  });
  console.log("✅ Cron Job de expiración iniciado.");
}

module.exports = {
  expirarTransaccionesAntiguas,
  iniciarCronJobExpiracion,
};
