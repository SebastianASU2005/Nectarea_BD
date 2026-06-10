// jobs/conciliatePendingPayments.js (versión final)
const { sequelize, Op } = require("../config/database");
const Transaccion = require("../models/transaccion");
const PagoMercado = require("../models/pagoMercado");
const pagoMercadoService = require("../services/pagoMercado.service");

const CONCILIATION_TIMEOUT_MINUTES = 10;

async function conciliatePendingPayments() {
  console.log(`🔍 [Conciliación] Iniciando búsqueda de pagos pendientes no confirmados...`);

  const fechaLimite = new Date(Date.now() - CONCILIATION_TIMEOUT_MINUTES * 60 * 1000);

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
      console.log(`✅ [Conciliación] No hay transacciones pendientes antiguas.`);
      return;
    }

    console.log(`📊 [Conciliación] Se encontraron ${transaccionesPendientes.length} transacciones pendientes antiguas.`);

    for (const transaccion of transaccionesPendientes) {
      let mpTransactionId = null;
      if (transaccion.pagoPasarela && transaccion.pagoPasarela.id_transaccion_pasarela) {
        mpTransactionId = transaccion.pagoPasarela.id_transaccion_pasarela;
      } else {
        console.warn(`⚠️ [Conciliación] Transacción ${transaccion.id} no tiene id_transaccion_pasarela asociado.`);
        continue;
      }

      console.log(`🔄 [Conciliación] Consultando estado para transacción ${transaccion.id} (ID MP: ${mpTransactionId})...`);

      try {
        const updatedData = await pagoMercadoService.refreshPaymentStatus(
          transaccion.id,
          mpTransactionId
        );
        if (updatedData && updatedData.transaccion.estado_transaccion !== transaccion.estado_transaccion) {
          console.log(`✅ [Conciliación] Transacción ${transaccion.id} actualizada de ${transaccion.estado_transaccion} a ${updatedData.transaccion.estado_transaccion}`);
        } else {
          console.log(`ℹ️ [Conciliación] Transacción ${transaccion.id} sigue en estado ${transaccion.estado_transaccion}`);
        }
      } catch (error) {
        console.error(`❌ [Conciliación] Error al refrescar transacción ${transaccion.id}:`, error.message);
      }
    }

    console.log(`🏁 [Conciliación] Proceso finalizado.`);
  } catch (error) {
    console.error(`❌ [Conciliación] Error general:`, error.message);
  }
}

module.exports = { conciliatePendingPayments };