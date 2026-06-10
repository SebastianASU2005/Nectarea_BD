// jobs/conciliatePendingPayments.js (VERSIÓN MEJORADA - SIN BUCLE INFINITO)

const { sequelize, Op } = require("../config/database");
const Transaccion = require("../models/transaccion");
const PagoMercado = require("../models/pagoMercado");
const pagoMercadoService = require("../services/pagoMercado.service");

const CONCILIATION_TIMEOUT_MINUTES = 10; // Transacciones con más de 10 minutos se consideran antiguas
const MAX_RETRIES = 5; // Máximo de reintentos antes de abandonar
const RETRY_DELAY_MS = 1000; // Espera 1 segundo entre refrescos (para no saturar)

// Mapa para llevar cuenta de reintentos por transacción
const retryCount = new Map();

// Limpieza periódica del mapa de reintentos (cada hora)
setInterval(() => {
  const now = Date.now();
  for (const [txId, data] of retryCount.entries()) {
    if (now - data.lastAttempt > 3600000) {
      // más de 1 hora sin intentos
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
    // Excluir transacciones que ya están en 'expirado' o estados terminales
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

    // ========== ORDENAR POR antigüedad (las más viejas primero) ==========
    transaccionesPendientes.sort((a, b) => a.createdAt - b.createdAt);

    for (const transaccion of transaccionesPendientes) {
      // ========== 1. Verificar si ya superó el límite de reintentos ==========
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

      // ========== 2. Verificar si la transacción es demasiado vieja (más de 60 minutos) ==========
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

      // ========== 3. Obtener el paymentId de MP ==========
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
          error_detalle: "No se pudo recuperar ID de pago en MercadoPago",
        });
        continue;
      }

      console.log(
        `🔄 [Conciliación] Consultando estado para transacción ${transaccion.id} (Intento #${retryInfo.count + 1})...`,
      );

      // Actualizar contador de reintentos
      retryCount.set(transaccion.id, {
        count: retryInfo.count + 1,
        lastAttempt: Date.now(),
      });

      try {
        // ========== 4. Llamar a refresh con un timeout controlado ==========
        const refreshPromise = pagoMercadoService.refreshPaymentStatus(
          transaccion.id,
          mpTransactionId,
        );

        // Timeout de 10 segundos para la llamada a MP
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
          // Si llegó a pagado, eliminamos del mapa de reintentos
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

        // Si el error es por timeout o MP no responde, aumentamos el contador pero no marcamos como fallida aún
        if (
          error.message.includes("Timeout") ||
          error.message.includes("ECONNREFUSED")
        ) {
          console.warn(
            `⚠️ [Conciliación] Problema de red con MP para transacción ${transaccion.id}. Se reintentará en la próxima ejecución.`,
          );
        } else if (retryInfo.count + 1 >= MAX_RETRIES) {
          // Si ya es el último reintento y sigue fallando, marcamos como expirado
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

      // Pequeña pausa para no saturar la API de MercadoPago
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }

    console.log(`🏁 [Conciliación] Proceso finalizado.`);
  } catch (error) {
    console.error(`❌ [Conciliación] Error general:`, error.message);
  }
}

module.exports = { conciliatePendingPayments };
