// Archivo: overduePaymentManager.js
// Versión corregida: todos los pagos se vencen y tienen recargos, sin cancelación automática.

const cron = require("node-cron");
const { Op } = require("sequelize");
const { sequelize } = require("../config/database");
const Pago = require("../models/pago");
const resumenCuentaService = require("../services/resumen_cuenta.service");

const overduePaymentManager = {
  job: cron.schedule(
    "35 09 * * *", // Se ejecuta a las 9:35 AM (hora del servidor)
    async () => {
      console.log("--- Iniciando la gestión de pagos vencidos y recargos ---");
      const t = await sequelize.transaction();
      const suscripcionIdsToUpdate = new Set();

      try {
        const dailyInterestRate = 0.04265 / 30; // 4.265% mensual / 30 días
        const now = new Date();
        const inicioDeHoy = new Date(now);
        inicioDeHoy.setHours(0, 0, 0, 0);

        // --------------------------------------------------------------
        // 1. Marcar como 'vencido' TODOS los pagos pendientes cuya fecha
        //    de vencimiento ya pasó (sin importar el mes).
        // --------------------------------------------------------------
        const pagosPendientesVencidos = await Pago.findAll({
          where: {
            estado_pago: "pendiente",
            fecha_vencimiento: { [Op.lt]: now }, // vencidos antes de ahora
          },
          transaction: t,
        });

        let marcadosVencidos = 0;
        for (const pago of pagosPendientesVencidos) {
          await pago.update({ estado_pago: "vencido" }, { transaction: t });
          marcadosVencidos++;
          suscripcionIdsToUpdate.add(pago.id_suscripcion);
        }
        console.log(`✅ Se marcaron ${marcadosVencidos} pagos como 'vencido'.`);

        // --------------------------------------------------------------
        // 2. Aplicar recargo diario a TODOS los pagos que ya están en
        //    estado 'vencido' y que no han sido actualizados hoy.
        // --------------------------------------------------------------
        const pagosVencidosConRecargo = await Pago.findAll({
          where: {
            estado_pago: "vencido",
            updatedAt: { [Op.lt]: inicioDeHoy }, // no se ha recargado hoy
          },
          transaction: t,
        });

        for (const pago of pagosVencidosConRecargo) {
          const dailyRecargo = parseFloat(pago.monto) * dailyInterestRate;
          const nuevoMonto = parseFloat(pago.monto) + dailyRecargo;
          await pago.update(
            { monto: nuevoMonto.toFixed(2) },
            { transaction: t },
          );
          console.log(
            `💰 Pago ID ${pago.id} (mes ${pago.mes}): recargo diario $${dailyRecargo.toFixed(2)} → nuevo monto $${nuevoMonto.toFixed(2)}`,
          );
          suscripcionIdsToUpdate.add(pago.id_suscripcion);
        }

        // --------------------------------------------------------------
        // 3. Actualizar resúmenes de cuenta para las suscripciones afectadas
        // --------------------------------------------------------------
        if (suscripcionIdsToUpdate.size > 0) {
          console.log(
            `📊 Actualizando ${suscripcionIdsToUpdate.size} resúmenes de cuenta...`,
          );
          for (const suscripcionId of suscripcionIdsToUpdate) {
            await resumenCuentaService.updateAccountSummaryOnPayment(
              suscripcionId,
              { transaction: t },
            );
          }
        }

        await t.commit();
        console.log("--- Gestión de pagos vencidos y recargos completada ---");
      } catch (error) {
        await t.rollback();
        console.error(
          "❌ Error fatal en el cron job de gestión de pagos:",
          error,
        );
      }
    },
    {
      scheduled: false,
    },
  ),

  /**
   * Inicia la tarea CRON programada.
   */
  start() {
    this.job.start();
    console.log(
      "✅ Cron job de pagos vencidos y recargos programado para ejecutarse diariamente a las 9:35 AM (hora del servidor).",
    );
  },

  /**
   * Ejecuta la lógica del cron job de forma manual (para pruebas).
   */
  async runManual() {
    console.log("--- EJECUCIÓN MANUAL DE TAREA DE VENCIMIENTO INICIADA ---");
    await this.job._task();
  },
};

module.exports = overduePaymentManager;
