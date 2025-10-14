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
  // Función para crear o actualizar una puja
  async create(data) {
    const { id_usuario, id_lote, monto_puja } = data;
    const t = await sequelize.transaction();

    try {
      const lote = await Lote.findByPk(id_lote, { transaction: t });
      if (!lote) throw new Error("Lote no encontrado.");
      if (lote.estado_subasta !== "activa")
        throw new Error("La subasta no está activa.");

      const id_proyecto = lote.id_proyecto; // 1. Buscar la puja activa existente del usuario en este lote

      const pujaExistente = await Puja.findOne({
        where: {
          id_usuario: id_usuario,
          id_lote: id_lote,
          estado_puja: "activa", // Solo consideramos pujas activas
        },
        transaction: t,
      });

      let pujaActualizada = null; // 2. Obtener la puja más alta del lote (puede ser la propia pujaExistente)

      let pujaMasAlta = null;
      if (lote.id_puja_mas_alta) {
        pujaMasAlta = await Puja.findByPk(lote.id_puja_mas_alta, {
          transaction: t,
        });
      } // 3. Validaciones Generales

      const montoPujaActual = pujaExistente ? pujaExistente.monto_puja : 0;

      if (monto_puja <= montoPujaActual) {
        throw new Error(
          "El nuevo monto de la puja debe ser mayor que tu puja actual."
        );
      }
      if (
        pujaMasAlta &&
        pujaMasAlta.id !== (pujaExistente ? pujaExistente.id : null) &&
        monto_puja <= pujaMasAlta.monto_puja
      ) {
        throw new Error(
          "El monto de la puja debe ser mayor que la puja actual más alta del lote."
        );
      }
      if (monto_puja < lote.precio_base) {
        throw new Error(
          "El monto de la puja debe ser mayor o igual al precio base."
        );
      } // =================================================================== // LÓGICA DE CREACIÓN O ACTUALIZACIÓN // ===================================================================

      if (pujaExistente) {
        // Caso 1: Actualización (Token ya consumido, no se toca)
        await pujaExistente.update(
          { monto_puja: monto_puja },
          { transaction: t }
        );
        pujaActualizada = pujaExistente;
      } else {
        // Caso 2: Creación (Se consume el token)
        const suscripcion = await SuscripcionProyecto.findOne({
          where: {
            id_usuario,
            id_proyecto,
            tokens_disponibles: { [Op.gt]: 0 },
          },
          transaction: t,
        });

        if (!suscripcion)
          throw new Error("No tienes tokens de subasta para este proyecto."); // 🚨 TOKEN: Consume el token al hacer la PRIMERA puja (1 -> 0)

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
        pujaActualizada = nuevaPuja;
      } // 4. Actualizar el lote con la puja más alta (solo si la nueva es la más alta)

      if (
        !lote.id_puja_mas_alta ||
        monto_puja > (pujaMasAlta ? pujaMasAlta.monto_puja : 0)
      ) {
        await lote.update(
          { id_puja_mas_alta: pujaActualizada.id },
          { transaction: t }
        );
      }

      await t.commit();
      return pujaActualizada;
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
    const pujaValidada = await this.getValidPaymentDetails(pujaId, userId);

    const TransaccionService = require("./transaccion.service");

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
      } // ✅ VALIDACIÓN ADICIONAL: Verificar que no haya expirado (aunque el controlador 2FA lo manejará)

      if (
        puja.fecha_vencimiento_pago &&
        puja.fecha_vencimiento_pago < new Date()
      ) {
        throw new Error("El plazo de pago para esta puja ha expirado.");
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
            required: true,
            include: [
              {
                association: "proyectoAsociado",
                required: true,
                attributes: ["id", "monto_inversion"],
              },
            ],
          },
          {
            model: Lote,
            as: "lote",
            required: true,
          },
        ],
      });

      if (!puja || !puja.suscripcion || !puja.lote) {
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

      // 8. 🚨 LÓGICA DE LIMPIEZA DEL PERDEDOR FINAL DENTRO DEL TOP 3 🚨
      // El ganador (P2 en el ejemplo) permanece en tokens: 0 (consumo final).
      // Se libera el token de CUALQUIER otro postor vivo del Top 3 (P3).

      const usuariosGanadoresActuales = [puja.id_usuario]; // Excluye al que acaba de pagar
      const loteId = puja.id_lote;

      // 8.1. Encontrar a los usuarios a liberar (e.g., P3)
      const pujasActivasPendientes = await Puja.findAll({
        where: {
          id_lote: loteId,
          // Buscamos pujas que fueron parte de la "zona caliente" (aún activas o pendientes)
          estado_puja: { [Op.in]: ["activa", "ganadora_pendiente"] },
          id_usuario: { [Op.notIn]: usuariosGanadoresActuales }, // Excluir al pagador
        },
        attributes: ["id_suscripcion"],
        transaction: t,
      });

      const suscripcionesALiberar = pujasActivasPendientes.map(
        (p) => p.id_suscripcion
      );

      // 8.2. Devolver el token a esas suscripciones (P3)
      if (suscripcionesALiberar.length > 0) {
        await SuscripcionProyecto.increment("tokens_disponibles", {
          by: 1,
          where: {
            id: { [Op.in]: suscripcionesALiberar },
            // Protección: Solo si su token fue consumido (está en 0)
            tokens_disponibles: { [Op.lt]: 1 },
          },
          transaction: t,
        });
      }

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
  }, // Asumo que esta función ya la tienes en el servicio de puja

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
      if (puja.estado_puja !== "ganadora_pagada") return puja; // Idempotencia // Revertir estado de la puja

      await puja.update(
        { estado_puja: "ganadora_pendiente" },
        { transaction: t }
      ); // Aquí iría la lógica inversa de los puntos 3, 4, 5 y 6 de procesarPujaGanadora. // Ej: Liberar meses pagados, reducir saldo_a_favor, etc. (Si no tienes esta lógica, es un pendiente)

      return { message: "Puja revertida a pendiente de pago exitosamente." };
    } catch (error) {
      throw error;
    }
  },

  /**
   * 🚨 FUNCIÓN CLAVE MODIFICADA 🚨
   * Libera el token de los perdedores masivos, dejando al Top 3 bloqueado.
   * Se llama al finalizar la subasta (endAuction).
   */
  async gestionarTokensAlFinalizar(id_lote) {
    const t = await sequelize.transaction();
    try {
      const lote = await Lote.findByPk(id_lote, { transaction: t });
      if (!lote) throw new Error("Lote no encontrado.");

      // 1. Encontrar a los usuarios del Top 3 (zona caliente)
      const pujasNoLiberar = await Puja.findAll({
        where: {
          id_lote: id_lote,
          estado_puja: "activa",
        },
        order: [["monto_puja", "DESC"]],
        limit: 3, // 🚨 Excluimos el Top 3 (P1, P2, P3)
        attributes: ["id_usuario"],
        transaction: t,
      });

      const usuariosNoLiberar = pujasNoLiberar.map((p) => p.id_usuario);

      // 2. Liberar tokens a todos los demás perdedores masivos (P4-P90)
      await SuscripcionProyecto.increment("tokens_disponibles", {
        by: 1,
        where: {
          id_proyecto: lote.id_proyecto,
          id_usuario: { [Op.notIn]: usuariosNoLiberar }, // 🚨 Condición para excluir al Top 3
          tokens_disponibles: { [Op.lt]: 1 }, // 🛡️ Protección: Solo si está en 0
        },
        transaction: t,
      });

      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }
  }, // =================================================================== // NUEVAS FUNCIONES PARA MANEJO DE IMPAGOS (90 DÍAS) // ===================================================================
  /**
   * 🚨 FUNCIÓN CLAVE MODIFICADA 🚨
   * Devuelve el token comprometido a un usuario después de que su puja ganadora
   * haya sido marcada como 'ganadora_incumplimiento' (impago).
   * @param {number} userId - ID del usuario que incumplió el pago.
   * @param {number} loteId - ID del lote (para determinar el proyecto).
   * @param {object} [externalTransaction] - Transacción de Sequelize opcional.
   */ async devolverTokenPorImpago(userId, loteId, externalTransaction = null) {
    // Usa la transacción externa o inicia una nueva si no se proporciona
    const t = externalTransaction || (await sequelize.transaction());
    const shouldCommit = !externalTransaction;

    try {
      // 1. Encontrar el lote para obtener el ID del proyecto
      const lote = await Lote.findByPk(loteId, {
        attributes: ["id_proyecto"],
        transaction: t,
      });
      if (!lote) throw new Error(`Lote ID ${loteId} no encontrado.`); // 2. Encontrar la suscripción (token) que el usuario utilizó para pujar en este proyecto

      const suscripcion = await SuscripcionProyecto.findOne({
        where: {
          id_usuario: userId,
          id_proyecto: lote.id_proyecto,
        },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      if (!suscripcion) {
        // ... (Advertencia)
        console.warn(
          `Advertencia: Suscripción para usuario ${userId} en proyecto ${lote.id_proyecto} no encontrada. No se pudo devolver el token.`
        );
        if (shouldCommit) await t.commit();
        return { message: "Token no devuelto (suscripción no encontrada)." };
      } // 3. Devolver 1 token al usuario (incrementar tokens_disponibles)

      // 🛡️ PROTECCIÓN CRÍTICA: Solo devolvemos si el token está en 0 (evitando tokens: 2)
      if (suscripcion.tokens_disponibles < 1) {
        await suscripcion.increment("tokens_disponibles", {
          by: 1,
          transaction: t,
        });
      } else {
        console.warn(
          `Advertencia: Usuario ${userId} ya tenía el token. No se incrementó para evitar duplicación.`
        );
      } // Solo hace commit si la transacción fue iniciada DENTRO de esta función

      if (shouldCommit) {
        await t.commit();
      }

      return { message: "Token devuelto exitosamente por impago." };
    } catch (error) {
      // Solo hace rollback si la transacción fue iniciada DENTRO de esta función
      if (shouldCommit) {
        await t.rollback();
      }
      throw error;
    }
  },
  /**
   * FUNCIÓN AÑADIDA PARA EL CONTROLADOR DE TEST: Encuentra la puja que está en estado 'ganadora_pendiente'
   * y que NO ha expirado (o cuyo vencimiento es futuro). Esta es la puja que se simula como impago.
   * @param {number} loteId - ID del lote.
   * @param {object} transaction - Transacción de Sequelize.
   * @returns {Promise<Puja|null>} La puja activa.
   */ async findGanadoraPendienteByLote(loteId, transaction) {
    return Puja.findOne({
      where: {
        id_lote: loteId,
        estado_puja: "ganadora_pendiente",
      },
      transaction,
    });
  },
  /**
   * CRON JOB: Encuentra todas las pujas ganadoras pendientes cuyo plazo de pago ha expirado.
   * @returns {Promise<Puja[]>} Lista de pujas vencidas.
   */ async findExpiredGanadoraPendiente() {
    return Puja.findAll({
      where: {
        estado_puja: "ganadora_pendiente",
        fecha_vencimiento_pago: {
          [Op.lt]: new Date(), // Menor que la fecha y hora actual (expirada)
        },
      },
      attributes: ["id", "id_lote", "id_usuario"],
    });
  },
  /**
   * CRON JOB: Encuentra la puja específica vencida para un lote dado.
   * @param {number} loteId - ID del lote.
   * @param {object} transaction - Transacción de Sequelize.
   * @returns {Promise<Puja|null>} La puja vencida.
   */ async findExpiredGanadoraPendienteByLote(loteId, transaction) {
    return Puja.findOne({
      where: {
        id_lote: loteId,
        estado_puja: "ganadora_pendiente",
        fecha_vencimiento_pago: {
          [Op.lt]: new Date(),
        },
      },
      transaction,
    });
  },
  /**
   * Encuentra la siguiente puja más alta que aún es válida y puede ser ganadora.
   * @param {number} loteId - ID del lote.
   * @param {object} transaction - Transacción de Sequelize.
   * @returns {Promise<Puja|null>} La siguiente mejor puja.
   */ async findNextHighestBid(loteId, transaction) {
    // Excluir pujas que ya han sido procesadas como ganadoras, pagadas o incumplidoras
    const estadosExcluidos = [
      "ganadora_pendiente",
      "ganadora_pagada",
      "ganadora_incumplimiento",
    ];

    return Puja.findOne({
      where: {
        id_lote: loteId,
        estado_puja: {
          [Op.notIn]: estadosExcluidos, // No re-seleccionar pujas que ya fallaron o ganaron
        },
      },
      order: [["monto_puja", "DESC"]], // La más alta
      transaction,
    });
  },
  /**
   * Elimina todas las pujas de un lote. Se utiliza para preparar el lote para reingreso anual.
   * @param {number} loteId - ID del lote.
   * @param {object} transaction - Transacción de Sequelize.
   * @returns {Promise<number>} Número de filas eliminadas.
   */ async clearBidsByLoteId(loteId, transaction) {
    return Puja.destroy({
      where: { id_lote: loteId },
      transaction,
    });
  }, // ... (Resto de funciones: findByIdAndUserId, findByUserId, etc.) ...

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
