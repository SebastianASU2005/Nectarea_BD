const cron = require("node-cron");
const { sequelize } = require("../config/database");
const Pago = require("../models/pago");
const { Op } = require("sequelize");

const overduePaymentManager = {
  job: cron.schedule(
    "0 3 * * *", // Se ejecuta todos los días a las 3:00 AM
    async () => {
      console.log(
        "--- Iniciando la gestión de pagos vencidos y limpieza de iniciales ---"
      );
      const t = await sequelize.transaction();

      try {
        const dailyInterestRate = 0.04265 / 30; // Tasa de interés diaria
        const now = new Date();

        // --- 1. PROCESO DE PAGOS RECURRENTES VENCIDOS (MES 2+) ---
        // Aplica recargo e interés a pagos que son de meses posteriores al inicial.
        console.log("-> Buscando pagos recurrentes vencidos (Mes 2+)...");

        const pagosRecurrentesVencidos = await Pago.findAll({
          where: {
            estado_pago: "pendiente",
            mes_pago: { [Op.gt]: 1 }, // FILTRO CRUCIAL: Solo Meses 2 en adelante
            fecha_vencimiento: { [Op.lt]: now },
          },
          transaction: t,
        });

        for (const pago of pagosRecurrentesVencidos) {
          const fechaVencimiento = new Date(pago.fecha_vencimiento);
          // Calcula los días vencidos para aplicar el recargo acumulado
          const diasVencidos = Math.floor(
            (now - fechaVencimiento) / (1000 * 60 * 60 * 24)
          );
          const recargo = pago.monto * (dailyInterestRate * diasVencidos);
          const nuevoMonto = parseFloat(pago.monto) + recargo;

          await pago.update(
            {
              estado_pago: "vencido", // Se marca como 'vencido' y se aplica recargo
              monto: nuevoMonto.toFixed(2),
            },
            { transaction: t }
          );
          console.log(
            `Pago recurrente ${pago.id} vencido. Se aplicó recargo de $${recargo.toFixed(
              2
            )}. Nuevo monto: $${nuevoMonto.toFixed(2)}.`
          );
        }

        // --- 2. PROCESO DE LIMPIEZA DE PAGO INICIAL ATASCADO (MES 1) ---
        // Marca como 'cancelado' los pagos iniciales que siguen pendientes, pero con un buffer de seguridad.

        // Buffer de seguridad: pagos cuya fecha de vencimiento (y presunta creación) pasó hace 2 horas.
        // Esto previene colisiones con usuarios en checkout en tiempo real.
        const safeTimeLimit = new Date(now.getTime() - 2 * 60 * 60 * 1000); // 2 horas de búfer

        console.log(
          `-> Buscando pagos iniciales atascados (Mes 1) anteriores a ${safeTimeLimit.toLocaleTimeString()}...`
        );

        const pagosInicialesAtascados = await Pago.findAll({
          where: {
            estado_pago: "pendiente",
            mes_pago: 1, // Solo Mes 1 (pago de suscripción inicial)
            fecha_vencimiento: { [Op.lt]: safeTimeLimit },
          },
          transaction: t,
        });

        for (const pago of pagosInicialesAtascados) {
          await pago.update(
            {
              estado_pago: "cancelado", // Se marca como 'cancelado' (fallido)
            },
            { transaction: t }
          );
          // IMPORTANTE: No se aplica recargo al pago inicial cancelado.
          console.log(
            `Pago inicial ${pago.id} atascado marcado como 'cancelado'.`
          );
        }

        await t.commit();
        console.log("--- Gestión de pagos completada. ---");
      } catch (error) {
        await t.rollback();
        console.error(
          "Error en el cron job de gestión de pagos:",
          error
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
      "Cron job de pagos vencidos programado para ejecutarse todos los días a las 3:00 AM."
    );
  },
};

module.exports = overduePaymentManager;
