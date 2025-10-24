// Archivo: overduePaymentManager.js

// Librerías de terceros
const cron = require("node-cron");
const { Op } = require("sequelize");

// Configuración y Modelos
const { sequelize } = require("../config/database");
const Pago = require("../models/pago");
// 🆕 IMPORTAMOS EL SERVICIO CLAVE
const resumenCuentaService = require("../services/resumen_cuenta.service");

/**
 * Módulo para la gestión diaria de pagos: aplica recargos a recurrentes vencidos
 * y limpia pagos iniciales que quedaron pendientes/atascados.
 */
const overduePaymentManager = {
  // Nota: La expresión CRON 31 12 * * * se ejecuta a las 12:31 PM (hora del servidor).
  job: cron.schedule(
    "35 09 * * *",
    async () => {
      console.log(
        "--- Iniciando la gestión de pagos vencidos y limpieza de iniciales ---"
      );
      const t = await sequelize.transaction();

      // 🆕 Set para almacenar los IDs de suscripciones que necesitan actualización
      const suscripcionIdsToUpdate = new Set();

      try {
        const dailyInterestRate = 0.04265 / 30;
        const now = new Date();
        // 🎯 CLAVE: Determinar el inicio del día para evitar dobles recargos
        const inicioDeHoy = new Date(now);
        inicioDeHoy.setHours(0, 0, 0, 0);

        // ----------------------------------------------------------------------
        // --- 1. PROCESO DE PAGOS RECURRENTES VENCIDOS (MES 2+) ---

        console.log(
          "-> Buscando y marcando pagos pendientes expirados (Mes 2+) como 'vencido'..."
        );

        const pagosAPartirDeMesDos = await Pago.findAll({
          where: {
            estado_pago: "pendiente",
            mes: { [Op.gt]: 1 },
            fecha_vencimiento: { [Op.lt]: now },
          },
          transaction: t,
        });

        let rowsUpdated = 0;
        for (const pago of pagosAPartirDeMesDos) {
          // ✅ Actualización individual para preservar todos los campos (id_usuario, id_proyecto, etc.)
          await pago.update({ estado_pago: "vencido" }, { transaction: t });
          rowsUpdated++;
          suscripcionIdsToUpdate.add(pago.id_suscripcion);
        }

        console.log(`Se marcaron ${rowsUpdated} pagos como 'vencido'.`);

        console.log(
          "-> Búsqueda e inicio de aplicación de recargo diario a pagos ya en estado 'vencido' (Mes 2+)..."
        );

        // 🚨 PASO B CORREGIDO: Filtramos por updatedAt < inicioDeHoy
        const pagosRecurrentesVencidos = await Pago.findAll({
          where: {
            estado_pago: "vencido",
            mes: { [Op.gt]: 1 },
            // 🎯 SOLO aplica recargo si no se ha aplicado HOY.
            updatedAt: { [Op.lt]: inicioDeHoy },
          },
          transaction: t,
        });

        for (const pago of pagosRecurrentesVencidos) {
          const dailyRecargo = parseFloat(pago.monto) * dailyInterestRate;
          const nuevoMonto = parseFloat(pago.monto) + dailyRecargo;

          // La actualización individual actualiza 'updatedAt', marcándolo como procesado HOY
          await pago.update(
            {
              monto: nuevoMonto.toFixed(2), // Se actualiza con el nuevo interés compuesto
            },
            { transaction: t }
          );
          console.log(
            `Pago recurrente ${
              pago.id
            } vencido. Se aplicó recargo DIARIO de $${dailyRecargo.toFixed(
              2
            )}. Nuevo monto: $${nuevoMonto.toFixed(2)}.`
          );

          // 🆕 Agregamos la suscripción al set para su actualización
          suscripcionIdsToUpdate.add(pago.id_suscripcion);
        }

        // ----------------------------------------------------------------------
        // --- 2. PROCESO DE LIMPIEZA DE PAGO INICIAL ATASCADO (MES 1) ---
        const safeTimeLimit = new Date(now.getTime() - 2 * 60 * 60 * 1000);

        console.log(
          `-> Buscando pagos iniciales atascados (Mes 1) anteriores a ${safeTimeLimit.toLocaleTimeString()}...`
        );

        const pagosInicialesAtascados = await Pago.findAll({
          where: {
            estado_pago: "pendiente",
            mes: 1,
            fecha_vencimiento: { [Op.lt]: safeTimeLimit },
          },
          transaction: t,
        });

        for (const pago of pagosInicialesAtascados) {
          // ✅ Actualización individual para preservar campos
          await pago.update(
            {
              estado_pago: "cancelado",
            },
            { transaction: t }
          );
          console.log(
            `Pago inicial ${pago.id} atascado marcado como 'cancelado'.`
          );
          suscripcionIdsToUpdate.add(pago.id_suscripcion);
        }

        // ----------------------------------------------------------------------
        // --- 3. ACTUALIZAR RESUMEN DE CUENTA PARA LAS SUSCRIPCIONES AFECTADAS ---

        console.log(
          `-> Actualizando resumen de cuenta para ${suscripcionIdsToUpdate.size} suscripciones afectadas...`
        );

        for (const suscripcionId of suscripcionIdsToUpdate) {
          await resumenCuentaService.updateAccountSummaryOnPayment(
            suscripcionId,
            { transaction: t }
          );
        }

        await t.commit();
        console.log(
          "--- Gestión de pagos y resumen de cuenta completada exitosamente. ---"
        );
      } catch (error) {
        await t.rollback();
        console.error("Error fatal en el cron job de gestión de pagos:", error);
      }
    },
    {
      scheduled: false,
    }
  ),
  // ... (Resto de las funciones start() y runManual() se mantienen igual)
  start() {
    this.job.start();
    console.log(
      "Cron job de pagos vencidos programado para ejecutarse a las 12:31 PM (hora de tu servidor). 🌅"
    );
  },

  async runManual() {
    console.log("--- EJECUCIÓN MANUAL DE TAREA DE VENCIMIENTO INICIADA ---");
    await this.job._task();
  },
};

module.exports = overduePaymentManager;
