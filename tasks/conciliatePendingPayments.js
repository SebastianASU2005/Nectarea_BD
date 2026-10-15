// jobs/conciliatePendingPayments.js (VERSIÓN MEJORADA - SIN BUCLE INFINITO)
// ← NUEVO: usa el registry para elegir la pasarela por transacción

const { sequelize, Op } = require("../config/database");
const Transaccion = require("../models/transaccion");
const PagoMercado = require("../models/pagoMercado");
// ← NUEVO: reemplaza pagoMercadoService por el registry
const { getGateway } = require("../services/pasarela.registry");

const CONCILIATION_TIMEOUT_MINUTES = 30;
const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 1000;

const retryCount = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [txId, data] of retryCount.entries()) {
    if (now - data.lastAttempt > 3600000) {
      retryCount.delete(txId);
    }
  }
}, 3600000);

async function conciliatePendingPayments() {
  console.log(
    `🔍 [Conciliación] Iniciando búsqueda de pagos pendientes no confirmados...`,
  );

  const fechaLimite = new Date(
    Date.now() - CONCILIATION_TIMEOUT_MINUTES * 60 * 1000,
  );

  try {
    const transaccionesPendientes = await Transaccion.findAll({
      where: {
        estado_transaccion: { [Op.in]: ["pendiente", "en_proceso"] },
        createdAt: { [Op.lt]: fechaLimite },
      },
      include: [
        {
          model: PagoMercado,
          as: "pagoPasarela",
          required: false,
        },
      ],
    });

    if (transaccionesPendientes.length === 0) {
      console.log(
        `✅ [Conciliación] No hay transacciones pendientes antiguas.`,
      );
      return;
    }

    console.log(
      `📊 [Conciliación] Se encontraron ${transaccionesPendientes.length} transacciones pendientes antiguas.`,
    );

    transaccionesPendientes.sort((a, b) => a.createdAt - b.createdAt);

    for (const transaccion of transaccionesPendientes) {
      const retryInfo = retryCount.get(transaccion.id) || {
        count: 0,
        lastAttempt: 0,
      };

      if (retryInfo.count >= MAX_RETRIES) {
        console.warn(
          `⏰ [Conciliación] Transacción ${transaccion.id} superó ${MAX_RETRIES} reintentos. Marcando como expirada.`,
        );
        await transaccion.update({
          estado_transaccion: "expirado",
          error_detalle: `Abandonado por conciliación tras ${MAX_RETRIES} intentos fallidos.`,
        });
        retryCount.delete(transaccion.id);
        continue;
      }

      const edadMinutos =
        (Date.now() - new Date(transaccion.createdAt)) / 60000;
      if (edadMinutos > 60) {
        console.warn(
          `⏰ [Conciliación] Transacción ${transaccion.id} tiene ${edadMinutos.toFixed(1)} minutos. Marcando como expirada definitivamente.`,
        );
        await transaccion.update({
          estado_transaccion: "expirado",
          error_detalle: `Expirada por antigüedad (${edadMinutos.toFixed(0)} min) sin pago confirmado.`,
        });
        retryCount.delete(transaccion.id);
        continue;
      }

      // ========== 3. Obtener el paymentId de la pasarela ==========
      let mpTransactionId = null;
      if (
        transaccion.pagoPasarela &&
        transaccion.pagoPasarela.id_transaccion_pasarela
      ) {
        mpTransactionId = transaccion.pagoPasarela.id_transaccion_pasarela;
      } else {
        console.warn(
          `⚠️ [Conciliación] Transacción ${transaccion.id} no tiene id_transaccion_pasarela. Marcando como fallida.`,
        );
        await transaccion.update({
          estado_transaccion: "fallido",
          // ← NUEVO: mensaje genérico (ya no siempre es Mercado Pago)
          error_detalle: "No se pudo recuperar el ID de pago en la pasarela",
        });
        continue;
      }

      console.log(
        `🔄 [Conciliación] Consultando estado para transacción ${transaccion.id} (Intento #${retryInfo.count + 1})...`,
      );

      retryCount.set(transaccion.id, {
        count: retryInfo.count + 1,
        lastAttempt: Date.now(),
      });

      try {
        // ========== 4. Llamar a refresh con un timeout controlado ==========
        // ← NUEVO: la pasarela depende de cómo se generó el pago (mercadopago | dlocal)
        const gateway = getGateway(transaccion.pagoPasarela.metodo_pasarela);
        const refreshPromise = gateway.refreshPaymentStatus(
          transaccion.id,
          mpTransactionId,
        );

        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("Timeout en refreshPaymentStatus")),
            10000,
          ),
        );

        const updatedData = await Promise.race([
          refreshPromise,
          timeoutPromise,
        ]);

        if (
          updatedData &&
          updatedData.transaccion.estado_transaccion !==
            transaccion.estado_transaccion
        ) {
          console.log(
            `✅ [Conciliación] Transacción ${transaccion.id} actualizada de ${transaccion.estado_transaccion} a ${updatedData.transaccion.estado_transaccion}`,
          );
          if (updatedData.transaccion.estado_transaccion === "pagado") {
            retryCount.delete(transaccion.id);
          }
        } else {
          console.log(
            `ℹ️ [Conciliación] Transacción ${transaccion.id} sigue en estado ${transaccion.estado_transaccion}`,
          );
        }
      } catch (error) {
        console.error(
          `❌ [Conciliación] Error al refrescar transacción ${transaccion.id}:`,
          error.message,
        );

        if (
          error.message.includes("Timeout") ||
          error.message.includes("ECONNREFUSED")
        ) {
          console.warn(
            `⚠️ [Conciliación] Problema de red con la pasarela para transacción ${transaccion.id}. Se reintentará en la próxima ejecución.`,
          );
        } else if (retryInfo.count + 1 >= MAX_RETRIES) {
          console.warn(
            `⏰ [Conciliación] Transacción ${transaccion.id} agotó reintentos. Marcando como expirada.`,
          );
          await transaccion.update({
            estado_transaccion: "expirado",
            error_detalle: `Abandonado tras ${MAX_RETRIES} errores: ${error.message}`,
          });
          retryCount.delete(transaccion.id);
        }
      }

      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }

    console.log(`🏁 [Conciliación] Proceso finalizado.`);
  } catch (error) {
    console.error(`❌ [Conciliación] Error general:`, error.message);
  }
}

module.exports = { conciliatePendingPayments };
