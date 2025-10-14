const LoteService = require("../services/lote.service");
const PujaService = require("../services/puja.service");
const { sequelize } = require("../config/database");

const testController = {
  /**
   * Simula el vencimiento inmediato de la puja 'ganadora_pendiente' de un lote.
   * Esto permite probar la lógica de reasignación (procesarImpagoLote) sin esperar 90 días.
   * * RUTA DE PRUEBA: POST /api/test/simular-impago/:loteId
   */
  async simularImpago(req, res) {
    const { loteId } = req.params;

    // Eliminamos la variable 't' y 'setupCommitted' ya que solo usaremos operaciones sin transacción en la FASE 1

    try {
      // === FASE 1: Preparar el escenario (Vencer la puja) - SIN TRANSACCIÓN ===

      // 1. Encontrar la puja que está en estado 'ganadora_pendiente' para este lote
      // NOTA: Usamos findOne sin transacción para encontrar la instancia
      const pujaVigente = await PujaService.findGanadoraPendienteByLote(
        loteId,
        null // No pasamos ninguna transacción de Sequelize aquí
      );

      if (!pujaVigente) {
        return res.status(404).json({
          message:
            "No se encontró ninguna puja 'ganadora_pendiente' activa para este lote.",
          loteId: parseInt(loteId),
        });
      }

      // 2. Modificar la fecha límite de pago a 'ayer'
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1); // Restamos un día

      // 🚨 Actualizamos directamente (sin transacción), lo que fuerza el COMMIT inmediato
      await pujaVigente.update(
        { fecha_vencimiento_pago: yesterday }
        // No { transaction: t }
      );

      console.log(
        `[TEST SIMULATOR] Puja ${pujaVigente.id} del Lote ${loteId} marcada como VENCIDA (Commit implícito).`
      );

      // === FASE 2: Ejecutar la lógica de negocio ===
      // 3. Ejecutar la lógica de manejo de impago.
      // ESTO INICIA SU PROPIA TRANSACCIÓN INTERNA Y VE LOS CAMBIOS DE LA FASE 1.
      await LoteService.procesarImpagoLote(parseInt(loteId));

      // 4. Notificar éxito
      res.status(200).json({
        message:
          "Simulación de impago ejecutada con éxito. Verifica la devolución de token y reasignación.",
        puja_vencida_id: pujaVigente.id,
        // ...
      });
    } catch (error) {
      // Ya no necesitamos la lógica de rollback compleja
      console.error("Error durante la simulación de impago:", error);
      res.status(500).json({
        error: "Fallo en la simulación de impago.",
        details: error.message,
      });
    }
  },
};

module.exports = testController;
