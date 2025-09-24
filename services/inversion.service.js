const Inversion = require("../models/inversion");
const Proyecto = require('../models/proyecto');
const TransaccionService = require('./transaccion.service'); // <-- NUEVO
const { sequelize } = require('../config/database'); // <-- NUEVO

const inversionService = {
  // ... (funciones existentes) ...

  // NUEVA FUNCIÓN: Procesa una inversión y crea la transacción asociada
  async processInvestment(inversionId, userId, transactionData) {
    const t = await sequelize.transaction();
    try {
      // 1. Encontrar la inversión
      const inversion = await this.findById(inversionId, { transaction: t });
      if (!inversion) {
        throw new Error('Inversión no encontrada.');
      }

      // 2. Crear el registro de Transacción
      await TransaccionService.create({
        ...transactionData,
        id_usuario: userId,
        id_proyecto: inversion.id_proyecto,
        id_inversion: inversion.id,
      }, { transaction: t });

      // 3. Opcional: Actualizar el estado de la inversión
      await inversion.update({ estado_inversion: 'confirmada' }, { transaction: t });

      await t.commit();
      return inversion;
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },
};

module.exports = inversionService;