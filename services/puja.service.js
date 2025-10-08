const Puja = require("../models/puja");
const Lote = require("../models/lote");
const SuscripcionProyecto = require("../models/suscripcion_proyecto");
const Pago = require("../models/pago");
const { Op } = require("sequelize");
const { sequelize } = require("../config/database");
const ProyectoService = require("./proyecto.service");
const PagoService = require("./pago.service");
// ❌ ELIMINAMOS la importación global que causaba la circularidad
// const TransaccionService = require("./transaccion.service");

// Helper para garantizar que un valor es un número flotante (decimal)
const toFloat = (value) => parseFloat(value);
// Helper para calcular y redondear con precisión, asegurando que el resultado es un número
const calculateFloat = (value) => toFloat(value.toFixed(2));

const pujaService = {
  // Función para crear una nueva puja
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
  },
  /**
   * 🛑 FUNCIÓN CLAVE: Orquesta el proceso de pago para una puja ganadora.
   * @param {number} pujaId - El ID de la puja ganadora.
   * @param {number} userId - El ID del usuario que intenta pagar.
   * @returns {Promise<{ transaccion: object, checkoutUrl: string }>}
   */ async requestCheckoutForPuja(pujaId, userId) {
    // 1. Validación de la puja y obtención de detalles del lote
    const pujaValidada = await this.getValidPaymentDetails(pujaId, userId); // ✅ CORRECCIÓN 1: Importación interna para romper la dependencia circular

    const TransaccionService = require("./transaccion.service"); // ✅ CORRECCIÓN 2: Usar la función que orquesta la transacción de BD.

    const checkoutResult = await TransaccionService.iniciarTransaccionYCheckout(
      "puja", // Nombre del modelo de negocio
      pujaValidada.id, // ID de la entidad específica (Puja)
      userId // ID del usuario
    );

    return {
      transaccion: checkoutResult.transaccion,
      checkoutUrl: checkoutResult.redirectUrl, // El controlador espera 'checkoutUrl'
    };
  },
  /**
   * 🛑 FUNCIÓN CLAVE: Valida que la puja sea del usuario y esté lista para pagar.
   * @param {number} pujaId - El ID de la puja a procesar.
   * @param {number} userId - El ID del usuario autenticado.
   * @param {Object} options - Opciones de transacción (opcional).
   * @returns {Promise<Puja>} El objeto Puja validado (incluyendo el Lote).
   */ async getValidPaymentDetails(pujaId, userId, options = {}) {
    try {
      // Buscar y Validar la Puja, incluyendo el Lote
      const puja = await Puja.findByPk(pujaId, {
        include: [{ model: Lote, as: "lote" }],
        ...options,
      });

      if (!puja) {
        throw new Error(`Puja ID ${pujaId} no encontrada.`);
      } // Validar la propiedad

      if (puja.id_usuario !== userId) {
        throw new Error(
          "Acceso denegado. No eres el propietario de esta puja."
        );
      }

      const estadoActual = puja.estado_puja; // La puja debe estar en estado pendiente de pago

      if (estadoActual !== "ganadora_pendiente") {
        throw new Error(
          `La puja ID ${pujaId} no está en estado 'ganadora_pendiente'. Estado actual: ${estadoActual}.`
        );
      }

      if (!puja.lote) {
        throw new Error(`La puja ID ${pujaId} no tiene lote asociado.`);
      }

      return puja;
    } catch (error) {
      throw error;
    }
  },
  /**
   * Función para procesar una puja ganadora y aplicar el excedente.
   * LLAMADA POR EL WEBHOOK A TRAVÉS DEL TRANSACCION SERVICE tras un pago exitoso.
   */ async procesarPujaGanadora(pujaId, externalTransaction = null) {
    const t = externalTransaction || (await sequelize.transaction());
    const shouldCommit = !externalTransaction;

    try {
      // 1. Encuentra la puja ganadora, su suscripción y el lote
      const puja = await Puja.findByPk(pujaId, {
        transaction: t,
        lock: t.LOCK.UPDATE,
        include: [
          {
            model: SuscripcionProyecto,
            as: "suscripcion",
            required: true, // Asegura INNER JOIN de Puja -> Suscripcion
            include: [
              {
                association: "proyectoAsociado", // Usar 'association' o el 'model'
                required: true, // 👈 SOLUCIÓN: Forzar INNER JOIN a Proyecto
                attributes: ["id", "monto_inversion"], // Opcional: solo cargar lo necesario
              },
            ],
          },
          {
            model: Lote,
            as: "lote",
            required: true, // 👈 FIX: Asegura INNER JOIN para FOR UPDATE
          },
        ],
      });

      if (!puja || !puja.suscripcion || !puja.lote) {
        // Si la puja está en un estado 'ganadora_pendiente', las relaciones DEBEN existir.
        // El 'required: true' ayuda a asegurar que los datos estén completos.
        throw new Error(
          "Puja, suscripción o lote no encontrados o incompletos."
        );
      } // Idempotencia: Si ya está pagada, retornar

      if (puja.estado_puja === "ganadora_pagada") {
        if (shouldCommit) await t.commit();
        return puja;
      }

      if (puja.estado_puja !== "ganadora_pendiente") {
        throw new Error(
          `La puja ${pujaId} tiene un estado inválido para el procesamiento de pago: ${puja.estado_puja}`
        );
      }

      const suscripcion = puja.suscripcion;
      const lote = puja.lote;

      if (!suscripcion.proyectoAsociado) {
        throw new Error(
          "El proyecto asociado a la suscripción no fue encontrado."
        );
      }

      const cuotaMensual = toFloat(
        suscripcion.proyectoAsociado.monto_inversion
      ); // Calcular el excedente

      let excedente = toFloat(puja.monto_puja) - toFloat(lote.precio_base);
      excedente = calculateFloat(excedente); // 2. Actualizar el monto ganador del lote

      await lote.update(
        { monto_ganador_lote: puja.monto_puja },
        { transaction: t }
      ); // 3. Prioridad 1: Cubrir pagos de suscripción pendientes

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
          );
          excedente = calculateFloat(excedente - montoPago);
        } else {
          const nuevoSaldo = calculateFloat(
            toFloat(suscripcion.saldo_a_favor) + excedente
          );
          await suscripcion.update(
            { saldo_a_favor: nuevoSaldo },
            { transaction: t }
          );
          excedente = 0;
          break;
        }
      } // 4. Prioridad 2: Pre-pagar meses futuros

      if (excedente > 0 && cuotaMensual > 0 && suscripcion.meses_a_pagar > 0) {
        const mesesAdicionales = Math.min(
          Math.floor(excedente / cuotaMensual),
          suscripcion.meses_a_pagar
        );
        if (mesesAdicionales > 0) {
          await suscripcion.decrement("meses_a_pagar", {
            by: mesesAdicionales,
            transaction: t,
          });
          excedente = calculateFloat(
            excedente - mesesAdicionales * cuotaMensual
          );
        }
      } // 5. Prioridad 3: Saldo a favor

      if (excedente > 0 && suscripcion.meses_a_pagar > 0) {
        const nuevoSaldo = calculateFloat(
          toFloat(suscripcion.saldo_a_favor) + excedente
        );
        await suscripcion.update(
          { saldo_a_favor: nuevoSaldo },
          { transaction: t }
        );
        excedente = 0;
      } // 6. Prioridad 4: Excedente para visualización

      if (suscripcion.meses_a_pagar <= 0 && excedente > 0) {
        await lote.update(
          { excedente_visualizacion: calculateFloat(excedente) },
          { transaction: t }
        );
        excedente = 0;
      } // 7. Actualizar estado final de la puja

      await puja.update({ estado_puja: "ganadora_pagada" }, { transaction: t });

      if (shouldCommit) {
        await t.commit();
      }

      return { message: "Puja procesada y pagos actualizados exitosamente." };
    } catch (error) {
      if (shouldCommit && t) {
        await t.rollback();
      }
      throw error;
    }
  },

  // Asumo que esta función ya la tienes en el servicio de puja
  async revertirPagoPujaGanadora(pujaId, externalTransaction) {
    // Lógica para revertir el pago de la puja (marcar como 'ganadora_pendiente' y revertir los efectos de pago en suscripción)
    const t = externalTransaction;
    if (!t)
      throw new Error(
        "Se requiere una transacción de BD activa para revertirPagoPujaGanadora."
      );

    try {
      const puja = await Puja.findByPk(pujaId, {
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      if (!puja) throw new Error("Puja no encontrada.");
      if (puja.estado_puja !== "ganadora_pagada") return puja; // Idempotencia

      // Revertir estado de la puja
      await puja.update(
        { estado_puja: "ganadora_pendiente" },
        { transaction: t }
      );

      // Aquí iría la lógica inversa de los puntos 3, 4, 5 y 6 de procesarPujaGanadora.
      // Ej: Liberar meses pagados, reducir saldo_a_favor, etc. (Si no tienes esta lógica, es un pendiente)

      return { message: "Puja revertida a pendiente de pago exitosamente." };
    } catch (error) {
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

  async findByIdAndUserId(id, userId) {
    return Puja.findOne({ where: { id, id_usuario: userId, activo: true } });
  },

  async findByUserId(userId) {
    return Puja.findAll({ where: { id_usuario: userId, activo: true } });
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
