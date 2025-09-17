const { sequelize } = require("../config/database");
const SuscripcionProyecto = require("../models/suscripcion_proyecto");
const Pago = require("../models/pago");
const Proyecto = require("../models/proyecto");
const SuscripcionCancelada = require("../models/suscripcion_cancelada");
const { getNextMonthDate } = require("../utils/dates");

const suscripcionProyectoService = {
  async create(data) {
    const t = await sequelize.transaction();
    try {
      const proyecto = await Proyecto.findByPk(data.id_proyecto, {
        transaction: t,
      });
      if (!proyecto) {
        throw new Error("Proyecto no encontrado.");
      }
      const nuevaSuscripcion = await SuscripcionProyecto.create(data, {
        transaction: t,
      });
      if (proyecto.tipo_inversion === "mensual") {
        await Pago.create(
          {
            id_suscripcion: nuevaSuscripcion.id,
            monto: proyecto.monto_inversion,
            fecha_vencimiento: getNextMonthDate(),
            estado_pago: "pendiente",
            mes: 1,
          },
          { transaction: t }
        );

        await Proyecto.increment("suscripciones_actuales", {
          by: 1,
          where: { id: data.id_proyecto },
          transaction: t,
        });

        await proyecto.reload({ transaction: t });
        if (proyecto.suscripciones_actuales >= proyecto.obj_suscripciones) {
          await proyecto.update(
            { estado_proyecto: "En proceso" },
            { transaction: t }
          );
        }
      }
      await t.commit();
      return nuevaSuscripcion;
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },

  async findByIdAndUserId(id, userId) {
    return SuscripcionProyecto.findOne({
      where: {
        id: id,
        id_usuario: userId,
        activo: true,
      },
    });
  },

  // Método de soft delete que incluye la lógica de negocio completa
  async softDelete(suscripcionId) {
    const t = await sequelize.transaction();
    try {
      const suscripcion = await SuscripcionProyecto.findByPk(suscripcionId, {
        transaction: t,
      });
      if (!suscripcion) throw new Error("Suscripción no encontrada.");
      if (!suscripcion.activo)
        throw new Error("La suscripción ya ha sido cancelada.");

      // Marcamos la suscripción como inactiva
      await suscripcion.update({ activo: false }, { transaction: t });

      // **NUEVO CAMBIO:** Se eliminan los tokens de la suscripción al ser cancelada
      await suscripcion.update({ tokens_disponibles: 0 }, { transaction: t });

      const proyecto = await Proyecto.findByPk(suscripcion.id_proyecto, {
        transaction: t,
      });
      if (proyecto) {
        await proyecto.decrement("suscripciones_actuales", {
          by: 1,
          transaction: t,
        });
      }

      const pagosRealizados = await Pago.findAll({
        where: {
          id_suscripcion: suscripcion.id,
          estado_pago: "pagado",
        },
        transaction: t,
      });

      const montoTotalPagado = pagosRealizados.reduce(
        (sum, pago) => sum + parseFloat(pago.monto),
        0
      );

      await SuscripcionCancelada.create(
        {
          id_suscripcion_original: suscripcion.id,
          id_usuario: suscripcion.id_usuario,
          id_proyecto: suscripcion.id_proyecto,
          meses_pagados: pagosRealizados.length,
          monto_pagado_total: montoTotalPagado,
          fecha_cancelacion: new Date(),
        },
        { transaction: t }
      );

      await t.commit();
      return suscripcion;
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },

  async findByUserId(userId) {
    return SuscripcionProyecto.findAll({
      where: {
        id_usuario: userId,
        activo: true,
      },
    });
  },

  async findAll() {
    return SuscripcionProyecto.findAll();
  },

  async findAllActivo() {
    return SuscripcionProyecto.findAll({
      where: {
        activo: true,
      },
    });
  },

  async findById(id) {
    return SuscripcionProyecto.findByPk(id);
  },
};

module.exports = suscripcionProyectoService;
