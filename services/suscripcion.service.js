const SuscripcionProyecto = require('../models/suscripcion_proyecto');
const Proyecto = require('../models/proyecto');
const Pago = require('../models/pago');
const SuscripcionCancelada = require('../models/suscripcion_cancelada');
const { sequelize } = require('../config/database');

const suscripcionService = {
  async findById(id) {
    return SuscripcionProyecto.findByPk(id);
  },

  async findByUserIdAndProjectId(userId, projectId) {
    return SuscripcionProyecto.findOne({
      where: {
        id_usuario: userId,
        id_proyecto: projectId,
        activo: true,
      },
    });
  },

  async softDelete(suscripcionId) {
    const t = await sequelize.transaction();
    try {
      const suscripcion = await SuscripcionProyecto.findByPk(suscripcionId, { transaction: t });
      if (!suscripcion) throw new Error("Suscripción no encontrada.");

      // Verificar si la suscripción ya está cancelada para evitar errores
      if (!suscripcion.activo) throw new Error("La suscripción ya ha sido cancelada.");
      
      // 1. Marcar la suscripción como inactiva (soft delete)
      await suscripcion.update({ activo: false }, { transaction: t });

      // 2. Decrementar el contador de suscriptores en el proyecto
      const proyecto = await Proyecto.findByPk(suscripcion.id_proyecto, { transaction: t });
      if (proyecto) {
        await proyecto.decrement('suscriptores_actuales', { by: 1, transaction: t });
      }

      // 3. Crear un registro en SuscripcionCancelada para el futuro reembolso
      const pagosRealizados = await Pago.findAll({
        where: {
          id_suscripcion: suscripcion.id,
          estado_pago: 'pagado',
        },
        transaction: t,
      });

      const montoTotalPagado = pagosRealizados.reduce((sum, pago) => sum + parseFloat(pago.monto), 0);

      await SuscripcionCancelada.create({
        id_suscripcion_original: suscripcion.id,
        id_usuario: suscripcion.id_usuario,
        id_proyecto: suscripcion.id_proyecto,
        meses_pagados: pagosRealizados.length,
        monto_pagado_total: montoTotalPagado,
        fecha_cancelacion: new Date(),
      }, { transaction: t });

      await t.commit();
      return suscripcion;

    } catch (error) {
      await t.rollback();
      throw error;
    }
  },
};

module.exports = suscripcionService;
