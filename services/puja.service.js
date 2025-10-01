const Puja = require("../models/puja");
const Lote = require("../models/lote");
const SuscripcionProyecto = require("../models/suscripcion_proyecto");
const Pago = require("../models/pago");
const { Op } = require("sequelize");
const { sequelize } = require("../config/database");
const ProyectoService = require("./proyecto.service");
const PagoService = require("./pago.service");

// Helper para garantizar que un valor es un número flotante (decimal)
const toFloat = (value) => parseFloat(value);
// Helper para calcular y redondear con precisión, asegurando que el resultado es un número
const calculateFloat = (value) => toFloat(value.toFixed(2));

const pujaService = {
  // Función para crear una nueva puja.
  async create(data) {
    const { id_usuario, id_lote, monto_puja } = data;
    const t = await sequelize.transaction();

    try {
      const lote = await Lote.findByPk(id_lote, { transaction: t });
      if (!lote) throw new Error("Lote no encontrado.");
      if (lote.estado_subasta !== "activa")
        throw new Error("La subasta no está activa.");

      const id_proyecto = lote.id_proyecto;

      let pujaMasAlta = null;
      if (lote.id_puja_mas_alta) {
        pujaMasAlta = await Puja.findByPk(lote.id_puja_mas_alta, {
          transaction: t,
        });
      }

      if (pujaMasAlta && monto_puja <= pujaMasAlta.monto_puja) {
        throw new Error(
          "El monto de la puja debe ser mayor que la puja actual más alta."
        );
      }
      if (monto_puja < lote.precio_base) {
        throw new Error(
          "El monto de la puja debe ser mayor o igual al precio base."
        );
      }

      const suscripcion = await SuscripcionProyecto.findOne({
        where: { id_usuario, id_proyecto, tokens_disponibles: { [Op.gt]: 0 } },
        transaction: t,
      });
      if (!suscripcion)
        throw new Error("No tienes tokens de subasta para este proyecto.");
      await suscripcion.decrement("tokens_disponibles", {
        by: 1,
        transaction: t,
      });

      const nuevaPuja = await Puja.create(
        {
          ...data,
          id_proyecto: id_proyecto,
          estado_puja: "activa",
          id_suscripcion: suscripcion.id,
        },
        { transaction: t }
      );

      await lote.update({ id_puja_mas_alta: nuevaPuja.id }, { transaction: t });

      await t.commit();
      return nuevaPuja;
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },

  async findHighestBidForLote(loteId) {
    return Puja.findOne({
      where: { id_lote: loteId },
      order: [["monto_puja", "DESC"]],
    });
  }
  /**
   * Función para procesar una puja ganadora y aplicar el excedente.
   * Acepta una transacción externa para ser atómica con el servicio de Transacción.
   * @param {number} pujaId - ID de la puja ganadora.
   * @param {object} [externalTransaction=null] - Transacción de Sequelize (opcional).
   */,

  async procesarPujaGanadora(pujaId, externalTransaction = null) {
    // Si no se proporciona una transacción externa, se crea una nueva localmente.
    const t = externalTransaction || (await sequelize.transaction()); // Bandera para saber si debemos hacer commit/rollback aquí
    const shouldCommit = !externalTransaction;

    try {
      // 1. Encuentra la puja ganadora, su suscripción y el lote
      const puja = await Puja.findByPk(pujaId, {
        transaction: t,
        include: [
          {
            model: SuscripcionProyecto,
            as: "suscripcion",
            include: ["proyectoAsociado"],
          },
          { model: Lote, as: "lote" },
        ],
      });

      if (!puja || !puja.suscripcion || !puja.lote) {
        throw new Error("Puja, suscripción o lote no encontrados.");
      }

      if (!puja.suscripcion.proyectoAsociado) {
        throw new Error(
          "El proyecto asociado a la suscripción no fue encontrado."
        );
      }

      const suscripcion = puja.suscripcion;
      const lote = puja.lote;

      // Usamos toFloat para asegurar que los montos son tratados como números.
      const cuotaMensual = toFloat(
        suscripcion.proyectoAsociado.monto_inversion
      ); // Inicializamos excedente con resta numérica directa

      let excedente = toFloat(puja.monto_puja) - toFloat(lote.precio_base);
      // Aseguramos precisión al inicio
      excedente = calculateFloat(excedente); // 2. Se actualiza el monto ganador del lote

      await lote.update(
        { monto_ganador_lote: puja.monto_puja },
        { transaction: t }
      ); // 3. Prioridad 1: Cubrir pagos pendientes solo si el excedente es suficiente para el monto completo.

      const pagosPendientes = await Pago.findAll({
        where: { id_suscripcion: suscripcion.id, estado_pago: "pendiente" },
        order: [["fecha_vencimiento", "ASC"]],
        transaction: t,
      });

      for (const pago of pagosPendientes) {
        const montoPago = toFloat(pago.monto);
        if (excedente >= montoPago) {
          await pago.update(
            {
              estado_pago: "cubierto_por_puja",
              fecha_pago: new Date(),
            },
            { transaction: t }
          ); // Recalculamos el excedente con precisión y aseguramos que sea float
          excedente = calculateFloat(excedente - montoPago);
        } else {
          // Si el excedente no alcanza para un pago completo, va a saldo a favor.
          // Aseguramos que la suma es numérica antes de actualizar.
          const nuevoSaldo = calculateFloat(
            toFloat(suscripcion.saldo_a_favor) + excedente
          );
          await suscripcion.update(
            {
              saldo_a_favor: nuevoSaldo, // Pasamos un número (float)
            },
            { transaction: t }
          );
          excedente = 0; // El excedente se ha usado.
          break; // Detenemos el bucle
        }
      } // 4. Prioridad 2: Pre-pagar meses futuros si hay excedente y meses pendientes

      if (excedente > 0 && cuotaMensual > 0 && suscripcion.meses_a_pagar > 0) {
        const mesesAdicionales = Math.min(
          Math.floor(excedente / cuotaMensual),
          suscripcion.meses_a_pagar
        );
        if (mesesAdicionales > 0) {
          await suscripcion.decrement("meses_a_pagar", {
            by: mesesAdicionales,
            transaction: t,
          }); // Recalculamos el excedente con precisión y aseguramos que sea float
          excedente = calculateFloat(
            excedente - mesesAdicionales * cuotaMensual
          );
        }
      } // 5. Prioridad 3: Si todavía queda excedente, va a saldo a favor.

      if (excedente > 0 && suscripcion.meses_a_pagar > 0) {
        // Aseguramos que la suma es numérica antes de actualizar.
        const nuevoSaldo = calculateFloat(
          toFloat(suscripcion.saldo_a_favor) + excedente
        );
        await suscripcion.update(
          {
            saldo_a_favor: nuevoSaldo, // Pasamos un número (float)
          },
          { transaction: t }
        );
        excedente = 0;
      } // 6. Prioridad 4: Si ya no hay meses por pagar y hay excedente, lo asignamos a la visualización.

      if (suscripcion.meses_a_pagar <= 0 && excedente > 0) {
        await lote.update(
          { excedente_visualizacion: calculateFloat(excedente) },
          { transaction: t }
        );
        excedente = 0;
      } // 7. Actualiza el estado de la puja
      await puja.update(
        {
          estado_puja: "ganadora_pagada",
        },
        { transaction: t }
      ); // Si la transacción fue creada internamente, se commite.

      if (shouldCommit) {
        await t.commit();
      }

      return { message: "Puja procesada y pagos actualizados exitosamente." };
    } catch (error) {
      // Si la transacción fue creada internamente y falló, se hace rollback.
      if (shouldCommit && t) {
        await t.rollback();
      }
      throw error;
    }
  },

  async gestionarTokensAlFinalizar(id_lote) {
    const t = await sequelize.transaction();
    try {
      const lote = await Lote.findByPk(id_lote, { transaction: t });
      if (!lote) throw new Error("Lote no encontrado.");

      await SuscripcionProyecto.increment("tokens_disponibles", {
        by: 1,
        where: {
          id_proyecto: lote.id_proyecto,
          id_usuario: { [Op.ne]: lote.id_ganador },
        },
        transaction: t,
      });
      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },

  async findByUserId(userId) {
    return Puja.findAll({ where: { id_usuario: userId, activo: true } });
  },

  async findByIdAndUserId(id, userId) {
    return Puja.findOne({ where: { id, id_usuario: userId, activo: true } });
  },

  async updateByIdAndUserId(id, userId, data) {
    const puja = await this.findByIdAndUserId(id, userId);
    if (!puja) return null;
    return puja.update(data);
  },

  async softDeleteByIdAndUserId(id, userId) {
    const puja = await this.findByIdAndUserId(id, userId);
    if (!puja) return null;
    return puja.update({ activo: false });
  },

  async findAll() {
    return Puja.findAll();
  },

  async findAllActivo() {
    return Puja.findAll({ where: { activo: true } });
  },

  async findById(id) {
    return Puja.findByPk(id);
  },

  async update(id, data) {
    const puja = await this.findById(id);
    if (!puja) return null;
    return puja.update(data);
  },

  async softDelete(id) {
    const puja = await this.findById(id);
    if (!puja) return null;
    return puja.update({ activo: false });
  },
};

module.exports = pujaService;
