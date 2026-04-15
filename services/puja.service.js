const Puja = require("../models/puja");
const Lote = require("../models/lote");
const SuscripcionProyecto = require("../models/suscripcion_proyecto");
const Pago = require("../models/pago");
const { Op } = require("sequelize");
const { sequelize } = require("../config/database");
const Usuario = require("../models/usuario");
const Proyecto = require("../models/proyecto");

// ✅ NOTA: ProyectoService, PagoService, ResumenCuentaService, emailService,
// MensajeService, SuscripcionService y LoteService se cargan dinámicamente
// dentro de las funciones que los necesitan para evitar dependencias circulares.

// Helper para garantizar que un valor es un número flotante (decimal)
const toFloat = (value) => parseFloat(value);
// Helper para calcular y redondear con precisión, asegurando que el resultado es un número
const calculateFloat = (value) => toFloat(value.toFixed(2));

/**
 * Servicio de lógica de negocio para la gestión de Pujas en los Lotes de Proyectos.
 * Incluye la creación, validación, y el procesamiento de pujas ganadoras y la gestión de tokens.
 */
const pujaService = {
  /**
   * @async
   * @function create
   * @description Crea o actualiza una puja para un lote, aplicando validaciones y gestionando el token de subasta.
   * @param {object} data - Datos de la puja ({ id_usuario, id_lote, monto_puja }).
   * @returns {Promise<Puja>} La instancia de la puja creada o actualizada.
   * @throws {Error} Si el lote no está activo, las pujas no cumplen las reglas, o el usuario no tiene token.
   */
  async create(data) {
    const { id_usuario, id_lote, monto_puja } = data;
    const usuario = await require("./usuario.service").findById(id_usuario);
    if (usuario && usuario.rol === "admin") {
      throw new Error(
        "⛔ Los administradores no pueden participar en subastas como clientes.",
      );
    }
    const t = await sequelize.transaction();

    try {
      const lote = await Lote.findByPk(id_lote, { transaction: t });
      if (!lote) throw new Error("Lote no encontrado.");
      if (lote.estado_subasta !== "activa")
        throw new Error("La subasta no está activa.");

      const id_proyecto = lote.id_proyecto;

      const pujaExistente = await Puja.findOne({
        where: {
          id_usuario: id_usuario,
          id_lote: id_lote,
          estado_puja: "activa",
        },
        transaction: t,
      });

      let pujaActualizada = null;

      let pujaMasAlta = null;
      if (lote.id_puja_mas_alta) {
        pujaMasAlta = await Puja.findByPk(lote.id_puja_mas_alta, {
          transaction: t,
        });
      }

      const montoPujaActual = pujaExistente ? pujaExistente.monto_puja : 0;

      if (monto_puja <= montoPujaActual) {
        throw new Error(
          "El nuevo monto de la puja debe ser mayor que tu puja actual.",
        );
      }
      if (
        pujaMasAlta &&
        pujaMasAlta.id !== (pujaExistente ? pujaExistente.id : null) &&
        monto_puja <= pujaMasAlta.monto_puja
      ) {
        throw new Error(
          "El monto de la puja debe ser mayor que la puja actual más alta del lote.",
        );
      }
      if (monto_puja < lote.precio_base) {
        throw new Error(
          "El monto de la puja debe ser mayor o igual al precio base.",
        );
      }

      if (pujaExistente) {
        await pujaExistente.update(
          { monto_puja: monto_puja },
          { transaction: t },
        );
        pujaActualizada = pujaExistente;
      } else {
        const suscripcion = await SuscripcionProyecto.findOne({
          where: {
            id_usuario,
            id_proyecto,
            tokens_disponibles: { [Op.gt]: 0 },
          },
          transaction: t,
          lock: t.LOCK.UPDATE,
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
          { transaction: t },
        );
        pujaActualizada = nuevaPuja;
      }

      if (
        !lote.id_puja_mas_alta ||
        monto_puja > (pujaMasAlta ? pujaMasAlta.monto_puja : 0)
      ) {
        await lote.update(
          { id_puja_mas_alta: pujaActualizada.id },
          { transaction: t },
        );
      }

      await t.commit();
      return pujaActualizada;
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },

  /**
   * @async
   * @function findHighestBidForLote
   * @description Busca la puja más alta registrada para un lote, sin importar su estado.
   * @param {number} loteId - ID del lote.
   * @returns {Promise<Puja|null>} La puja más alta.
   */
  async findHighestBidForLote(loteId) {
    return Puja.findOne({
      where: {
        id_lote: loteId,
        estado_puja: "activa",
      },
      include: [
        {
          model: Usuario,
          as: "usuario",
          attributes: ["id", "nombre", "apellido", "email", "nombre_usuario"],
        },
        {
          model: Lote,
          as: "lote",
          attributes: [
            "id",
            "nombre_lote",
            "precio_base",
            "estado_subasta",
            "id_proyecto",
            "latitud",
            "longitud",
          ],
          include: [
            {
              model: Proyecto,
              as: "proyectoLote",
              attributes: [
                "id",
                "nombre_proyecto",
                "tipo_inversion",
                "estado_proyecto",
                "latitud",
                "longitud",
                "descripcion",
                "monto_inversion",
                "moneda",
              ],
            },
          ],
        },
      ],
      order: [["monto_puja", "DESC"]],
    });
  },

  // -------------------------------------------------------------------
  // LÓGICA DE CHECKOUT Y PAGO DE PUJA GANADORA
  // -------------------------------------------------------------------

  /**
   * @async
   * @function requestCheckoutForPuja
   * @description Orquesta la solicitud de pago (checkout) para una puja ganadora pendiente.
   * @param {number} pujaId - El ID de la puja ganadora.
   * @param {number} userId - El ID del usuario que intenta pagar.
   * @returns {Promise<{ transaccion: object, checkoutUrl: string }>}
   */
  async requestCheckoutForPuja(pujaId, userId) {
    const pujaValidada = await this.getValidPaymentDetails(pujaId, userId);

    const TransaccionService = require("./transaccion.service");

    const checkoutResult = await TransaccionService.iniciarTransaccionYCheckout(
      "puja",
      pujaValidada.id,
      userId,
    );

    return {
      transaccion: checkoutResult.transaccion,
      checkoutUrl: checkoutResult.redirectUrl,
    };
  },

  /**
   * @async
   * @function getValidPaymentDetails
   * @description Valida que una puja esté en estado `ganadora_pendiente`, pertenezca al usuario y no haya expirado.
   * @param {number} pujaId - El ID de la puja a procesar.
   * @param {number} userId - El ID del usuario autenticado.
   * @param {Object} [options={}] - Opciones de transacción (opcional).
   * @returns {Promise<Puja>} El objeto Puja validado (incluyendo el Lote).
   * @throws {Error} Si la puja no cumple las condiciones.
   */
  async getValidPaymentDetails(pujaId, userId, options = {}) {
    try {
      const puja = await Puja.findByPk(pujaId, {
        include: [
          {
            model: Lote,
            as: "lote",
            include: [
              {
                model: Proyecto,
                as: "proyectoLote",
                attributes: [
                  "id",
                  "nombre_proyecto",
                  "tipo_inversion",
                  "estado_proyecto",
                  "latitud",
                  "longitud",
                ],
              },
            ],
          },
        ],
        ...options,
      });

      if (!puja) {
        throw new Error(`Puja ID ${pujaId} no encontrada.`);
      }

      if (puja.id_usuario !== userId) {
        throw new Error(
          "Acceso denegado. No eres el propietario de esta puja.",
        );
      }

      const estadoActual = puja.estado_puja;

      if (estadoActual !== "ganadora_pendiente") {
        throw new Error(
          `La puja ID ${pujaId} no está en estado 'ganadora_pendiente'. Estado actual: ${estadoActual}.`,
        );
      }

      if (
        puja.fecha_vencimiento_pago &&
        puja.fecha_vencimiento_pago < new Date()
      ) {
        throw new Error("El plazo de pago para esta puja ha expirado.");
      }

      if (!puja.lote) {
        throw new Error(`La puja ID ${pujaId} no tiene lote asociado.`);
      }

      // 🆕 VALIDACIÓN CLAVE: Verificar que el usuario sigue suscrito al proyecto del lote
      if (puja.lote.id_proyecto) {
        const suscripcionActiva = await SuscripcionProyecto.findOne({
          where: {
            id_usuario: userId,
            id_proyecto: puja.lote.id_proyecto,
            activo: true,
          },
          ...options, // propaga la transaction si viene
        });

        if (!suscripcionActiva) {
          throw new Error(
            "❌ No puedes pagar esta puja. Tu suscripción al proyecto asociado ha sido cancelada.",
          );
        }
      }

      return puja;
    } catch (error) {
      throw error;
    }
  },

  /**
   * @async
   * @function procesarPujaGanadora
   * @description Función CLAVE: Se ejecuta tras un pago exitoso. Marca la puja como pagada, actualiza el lote
   * y distribuye el excedente. Finalmente, libera el token de los perdedores restantes.
   * @param {number} pujaId - ID de la puja ganadora.
   * @param {object} [externalTransaction] - Transacción de Sequelize si ya existe.
   * @returns {Promise<{message: string}>}
   */
  async procesarPujaGanadora(pujaId, externalTransaction = null) {
    const ResumenCuentaService = require("./resumen_cuenta.service");

    const t = externalTransaction || (await sequelize.transaction());
    const shouldCommit = !externalTransaction;

    try {
      const pujaBase = await Puja.findByPk(pujaId, {
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      if (!pujaBase) {
        throw new Error("Puja no encontrada.");
      }

      const puja = await Puja.findByPk(pujaId, {
        transaction: t,
        include: [
          {
            model: SuscripcionProyecto,
            as: "suscripcion",
            required: true,
            include: [
              {
                association: "proyectoAsociado",
                required: true,
                attributes: [
                  "id",
                  "monto_inversion",
                  "nombre_proyecto",
                  "tipo_inversion",
                  "estado_proyecto",
                ],
              },
            ],
          },
          {
            model: Lote,
            as: "lote",
            required: true,
            include: [
              {
                model: Proyecto,
                as: "proyectoLote",
                attributes: [
                  "id",
                  "nombre_proyecto",
                  "tipo_inversion",
                  "estado_proyecto",
                  "latitud",
                  "longitud",
                  "descripcion",
                ],
              },
            ],
          },
        ],
      });

      if (!puja || !puja.suscripcion || !puja.lote) {
        throw new Error(
          "Puja, suscripción o lote no encontrados o incompletos.",
        );
      }

      if (puja.estado_puja === "ganadora_pagada") {
        if (shouldCommit) await t.commit();
        return puja;
      }

      if (puja.estado_puja !== "ganadora_pendiente") {
        throw new Error(
          `La puja ${pujaId} tiene un estado inválido: ${puja.estado_puja}`,
        );
      }

      const suscripcion = puja.suscripcion;
      const lote = puja.lote;

      if (!suscripcion.proyectoAsociado) {
        throw new Error(
          "El proyecto asociado a la suscripción no fue encontrado.",
        );
      }

      const cuotaMensual = toFloat(
        suscripcion.proyectoAsociado.monto_inversion,
      );
      let excedente = calculateFloat(
        toFloat(puja.monto_puja) - toFloat(lote.precio_base),
      );

      // ── 1. Cubrir pagos pendientes existentes con el excedente ──────────
      const pagosPendientes = await Pago.findAll({
        where: { id_suscripcion: suscripcion.id, estado_pago: "pendiente" },
        order: [["fecha_vencimiento", "ASC"]],
        transaction: t,
      });

      for (const pago of pagosPendientes) {
        const montoPago = toFloat(pago.monto);
        if (excedente >= montoPago) {
          await pago.update(
            { estado_pago: "cubierto_por_puja", fecha_pago: new Date() },
            { transaction: t },
          );
          excedente = calculateFloat(excedente - montoPago);
        } else {
          const nuevoSaldo = calculateFloat(
            toFloat(suscripcion.saldo_a_favor) + excedente,
          );
          await suscripcion.update(
            { saldo_a_favor: nuevoSaldo },
            { transaction: t },
          );
          excedente = 0;
          break;
        }
      }

      // ── 2. Cubrir cuotas futuras creando Pagos reales ───────────────────
      if (excedente > 0 && cuotaMensual > 0 && suscripcion.meses_a_pagar > 0) {
        const mesesAdicionales = Math.min(
          Math.floor(excedente / cuotaMensual),
          suscripcion.meses_a_pagar,
        );

        if (mesesAdicionales > 0) {
          const ultimoPago = await Pago.findOne({
            where: { id_suscripcion: suscripcion.id },
            order: [["mes", "DESC"]],
            transaction: t,
          });
          const proximoMes = ultimoPago ? ultimoPago.mes + 1 : 1;

          for (let i = 0; i < mesesAdicionales; i++) {
            const fechaVencimiento = new Date();
            fechaVencimiento.setMonth(fechaVencimiento.getMonth() + i);
            fechaVencimiento.setDate(10);
            fechaVencimiento.setHours(0, 0, 0, 0);

            await Pago.create(
              {
                id_suscripcion: suscripcion.id,
                id_usuario: suscripcion.id_usuario,
                id_proyecto: suscripcion.id_proyecto,
                monto: 0,
                fecha_vencimiento: fechaVencimiento,
                fecha_pago: new Date(),
                estado_pago: "cubierto_por_puja",
                mes: proximoMes + i,
                motivo: `Cuota cubierta por excedente de puja (Lote #${lote.id})`,
              },
              { transaction: t },
            );
          }

          await suscripcion.decrement("meses_a_pagar", {
            by: mesesAdicionales,
            transaction: t,
          });

          excedente = calculateFloat(
            excedente - mesesAdicionales * cuotaMensual,
          );
        }
      }

      // ── 3. Excedente parcial que no alcanza para una cuota ──────────────
      if (excedente > 0 && suscripcion.meses_a_pagar > 0) {
        const nuevoSaldo = calculateFloat(
          toFloat(suscripcion.saldo_a_favor) + excedente,
        );
        await suscripcion.update(
          { saldo_a_favor: nuevoSaldo },
          { transaction: t },
        );
        excedente = 0;
      }

      // ── 4. Excedente visual si ya no quedan meses por pagar ────────────
      if (suscripcion.meses_a_pagar <= 0 && excedente > 0) {
        await lote.update(
          { excedente_visualizacion: calculateFloat(excedente) },
          { transaction: t },
        );
        excedente = 0;
      }

      // ── 5. Marcar puja como pagada ──────────────────────────────────────
      await puja.update({ estado_puja: "ganadora_pagada" }, { transaction: t });

      // ── 6. Consumir token de forma permanente ───────────────────────────
      await suscripcion.update(
        { tokens_disponibles: 0, token_consumido: true },
        { transaction: t },
      );

      // ── 7. Actualizar ResumenCuenta ─────────────────────────────────────
      await ResumenCuentaService.updateAccountSummaryOnPayment(suscripcion.id, {
        transaction: t,
      });

      // ── 8. Devolver token a los otros postores retenidos (top 3 minus ganador) ──
      // ✅ FIX 2: usar devolverTokenPorImpago individualmente en lugar del
      // increment masivo condicional, garantizando que postores en
      // "ganadora_incumplimiento" también recuperen su token.
      const pujasALiberar = await Puja.findAll({
        where: {
          id_lote: lote.id,
          estado_puja: {
            [Op.in]: [
              "activa",
              "ganadora_pendiente",
              "ganadora_incumplimiento",
            ],
          },
          id_usuario: { [Op.ne]: puja.id_usuario },
        },
        attributes: ["id_usuario"],
        transaction: t,
      });

      for (const pujaALiberar of pujasALiberar) {
        await this.devolverTokenPorImpago(pujaALiberar.id_usuario, lote.id, t);
      }

      if (shouldCommit) await t.commit();
      return { message: "Puja procesada y pagos actualizados exitosamente." };
    } catch (error) {
      if (shouldCommit && t) await t.rollback();
      console.error("Error en procesarPujaGanadora:", error.message);
      throw error;
    }
  },
  /**
   * @async
   * @function revertirPagoPujaGanadora
   * @description Revierte el estado de una puja de 'ganadora_pagada' a 'ganadora_pendiente'.
   * @param {number} pujaId - ID de la puja a revertir.
   * @param {object} externalTransaction - Transacción de Sequelize activa.
   * @returns {Promise<object>} El objeto Puja actualizado o un mensaje.
   */
  async revertirPagoPujaGanadora(pujaId, externalTransaction) {
    const t = externalTransaction;
    if (!t)
      throw new Error(
        "Se requiere una transacción de BD activa para revertirPagoPujaGanadora.",
      );

    try {
      const puja = await Puja.findByPk(pujaId, {
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      if (!puja) throw new Error("Puja no encontrada.");
      if (puja.estado_puja !== "ganadora_pagada") return puja;

      await puja.update(
        { estado_puja: "ganadora_pendiente" },
        { transaction: t },
      );

      return { message: "Puja revertida a pendiente de pago exitosamente." };
    } catch (error) {
      throw error;
    }
  },

  // -------------------------------------------------------------------
  // LÓGICA DE CIERRE DE SUBASTA Y GESTIÓN DE INCUMPLIMIENTO
  // -------------------------------------------------------------------

  /**
   * @async
   * @function gestionarTokensAlFinalizar
   * @description Libera el token de los perdedores masivos (P4 en adelante),
   * dejando el Top 3 bloqueado para la secuencia de pago/impago.
   * @param {number} id_lote - ID del lote que finaliza.
   */
  async gestionarTokensAlFinalizar(id_lote) {
    const t = await sequelize.transaction();
    try {
      const lote = await Lote.findByPk(id_lote, { transaction: t });
      if (!lote) throw new Error("Lote no encontrado.");

      // DESPUÉS (fix):
      const pujasNoLiberar = await Puja.findAll({
        where: {
          id_lote: id_lote,
          estado_puja: { [Op.in]: ["activa", "ganadora_pendiente"] }, // ← incluye al ganador
        },
        order: [["monto_puja", "DESC"]],
        limit: 3,
        attributes: ["id_usuario"],
        transaction: t,
      });

      const usuariosNoLiberar = pujasNoLiberar.map((p) => p.id_usuario);

      await SuscripcionProyecto.increment("tokens_disponibles", {
        by: 1,
        where: {
          id_proyecto: lote.id_proyecto,
          id_usuario: { [Op.notIn]: usuariosNoLiberar },
          tokens_disponibles: { [Op.lt]: 1 },
          token_consumido: false,
        },
        transaction: t,
      });

      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },

  /**
   * @async
   * @function devolverTokenPorImpago
   * @description Devuelve el token comprometido a un usuario después de un impago.
   * @param {number} userId - ID del usuario que incumplió el pago.
   * @param {number} loteId - ID del lote (para determinar el proyecto).
   * @param {object} [externalTransaction] - Transacción de Sequelize opcional.
   * @returns {Promise<object>} Mensaje de resultado.
   */
  async devolverTokenPorImpago(userId, loteId, externalTransaction = null) {
    const t = externalTransaction || (await sequelize.transaction());
    const shouldCommit = !externalTransaction;

    try {
      const lote = await Lote.findByPk(loteId, {
        attributes: ["id_proyecto"],
        transaction: t,
      });
      if (!lote) throw new Error(`Lote ID ${loteId} no encontrado.`);

      const suscripcion = await SuscripcionProyecto.findOne({
        where: {
          id_usuario: userId,
          id_proyecto: lote.id_proyecto,
        },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      if (!suscripcion) {
        console.warn(
          `[devolverTokenPorImpago] ⚠️ Suscripción no encontrada para usuario ${userId} en proyecto ${lote.id_proyecto}. Token no devuelto.`,
        );
        if (shouldCommit) await t.commit();
        return { message: "Token no devuelto (suscripción no encontrada)." };
      }

      if (suscripcion.token_consumido) {
        console.warn(
          `[devolverTokenPorImpago] 🔒 Token NO devuelto: suscripción ${suscripcion.id} del usuario ${userId} ya consumió su token en una subasta ganada y pagada.`,
        );
        if (shouldCommit) await t.commit();
        return {
          message: "Token no devuelto (ya consumido por subasta ganada).",
        };
      }

      if (suscripcion.tokens_disponibles < 1) {
        await suscripcion.increment("tokens_disponibles", {
          by: 1,
          transaction: t,
        });
        console.log(
          `[devolverTokenPorImpago] ✅ Token devuelto exitosamente — usuario ${userId}, suscripción ${suscripcion.id}, lote ${loteId}, proyecto ${lote.id_proyecto}.`,
        );
      } else {
        console.log(
          `[devolverTokenPorImpago] ℹ️ Usuario ${userId} (suscripción ${suscripcion.id}) ya tenía token disponible (tokens_disponibles=${suscripcion.tokens_disponibles}). No se realizó ningún cambio.`,
        );
      }

      if (shouldCommit) {
        await t.commit();
      }

      return { message: "Token devuelto exitosamente por impago." };
    } catch (error) {
      if (shouldCommit) {
        await t.rollback();
      }
      console.error(
        `[devolverTokenPorImpago] ❌ ERROR al devolver token — usuario ${userId}, lote ${loteId}:`,
        error.message,
      );
      throw error;
    }
  },
  // -------------------------------------------------------------------
  // FUNCIONES DE CONSULTA (CRON JOB Y ADMINISTRACIÓN)
  // -------------------------------------------------------------------

  /**
   * @async
   * @function findGanadoraPendienteByLote
   * @description Encuentra la puja en estado 'ganadora_pendiente' para un lote.
   */
  async findGanadoraPendienteByLote(loteId, transaction) {
    return Puja.findOne({
      where: {
        id_lote: loteId,
        estado_puja: "ganadora_pendiente",
      },
      include: [
        {
          model: Usuario,
          as: "usuario",
          attributes: ["id", "nombre", "apellido", "email", "nombre_usuario"],
        },
        {
          model: Lote,
          as: "lote",
          attributes: [
            "id",
            "nombre_lote",
            "precio_base",
            "estado_subasta",
            "id_proyecto",
            "latitud",
            "longitud",
          ],
          include: [
            {
              model: Proyecto,
              as: "proyectoLote",
              attributes: [
                "id",
                "nombre_proyecto",
                "tipo_inversion",
                "estado_proyecto",
                "latitud",
                "longitud",
              ],
            },
          ],
        },
      ],
      transaction,
    });
  },

  /**
   * @async
   * @function findExpiredGanadoraPendiente
   * @description Busca todas las pujas ganadoras pendientes cuyo plazo de pago ha expirado. (Para CRON JOB).
   */
  async findExpiredGanadoraPendiente() {
    return Puja.findAll({
      where: {
        estado_puja: "ganadora_pendiente",
        fecha_vencimiento_pago: {
          [Op.lt]: new Date(),
        },
      },
      include: [
        {
          model: Usuario,
          as: "usuario",
          attributes: ["id", "nombre", "apellido", "email", "nombre_usuario"],
        },
        {
          model: Lote,
          as: "lote",
          attributes: [
            "id",
            "nombre_lote",
            "precio_base",
            "estado_subasta",
            "id_proyecto",
            "latitud",
            "longitud",
          ],
          include: [
            {
              model: Proyecto,
              as: "proyectoLote",
              attributes: [
                "id",
                "nombre_proyecto",
                "tipo_inversion",
                "estado_proyecto",
                "latitud",
                "longitud",
              ],
            },
          ],
        },
      ],
      attributes: [
        "id",
        "id_lote",
        "id_usuario",
        "monto_puja",
        "estado_puja",
        "fecha_vencimiento_pago",
      ],
    });
  },

  /**
   * @async
   * @function findExpiredGanadoraPendienteByLote
   * @description Encuentra la puja vencida para un lote dado. (Para CRON JOB).
   */
  async findExpiredGanadoraPendienteByLote(loteId, transaction) {
    return Puja.findOne({
      where: {
        id_lote: loteId,
        estado_puja: "ganadora_pendiente",
        fecha_vencimiento_pago: {
          [Op.lt]: new Date(),
        },
      },
      include: [
        {
          model: Usuario,
          as: "usuario",
          attributes: ["id", "nombre", "apellido", "email", "nombre_usuario"],
        },
        {
          model: Lote,
          as: "lote",
          attributes: [
            "id",
            "nombre_lote",
            "precio_base",
            "estado_subasta",
            "id_proyecto",
            "latitud",
            "longitud",
          ],
          include: [
            {
              model: Proyecto,
              as: "proyectoLote",
              attributes: [
                "id",
                "nombre_proyecto",
                "tipo_inversion",
                "estado_proyecto",
                "latitud",
                "longitud",
              ],
            },
          ],
        },
      ],
      transaction,
    });
  },

  /**
   * @async
   * @function findNextHighestBid
   * @description Encuentra la siguiente puja más alta en estado 'activa'.
   */
  async findNextHighestBid(loteId, transaction) {
    const estadosExcluidos = [
      "ganadora_pendiente",
      "ganadora_pagada",
      "ganadora_incumplimiento",
    ];

    return Puja.findOne({
      where: {
        id_lote: loteId,
        estado_puja: {
          [Op.notIn]: estadosExcluidos,
        },
      },
      include: [
        {
          model: Usuario,
          as: "usuario",
          attributes: ["id", "nombre", "apellido", "email", "nombre_usuario"],
        },
        {
          model: Lote,
          as: "lote",
          attributes: [
            "id",
            "nombre_lote",
            "precio_base",
            "estado_subasta",
            "id_proyecto",
            "latitud",
            "longitud",
          ],
          include: [
            {
              model: Proyecto,
              as: "proyectoLote",
              attributes: [
                "id",
                "nombre_proyecto",
                "tipo_inversion",
                "estado_proyecto",
                "latitud",
                "longitud",
              ],
            },
          ],
        },
      ],
      order: [["monto_puja", "DESC"]],
      transaction,
    });
  },

  /**
   * @async
   * @function clearBidsByLoteId
   * @description Elimina todas las pujas de un lote (Hard delete).
   */
  async clearBidsByLoteId(loteId, transaction) {
    return Puja.destroy({
      where: { id_lote: loteId },
      transaction,
    });
  },

  /**
   * @async
   * @function hasWonAndPaidBid
   * @description Verifica si un usuario tiene una puja ganadora y pagada en un proyecto específico.
   */
  async hasWonAndPaidBid(userId, projectId, options = {}) {
    const { transaction } = options;

    // Busca via id_lote → lote.id_proyecto para no depender
    // de que id_proyecto esté correctamente seteado en la puja
    const pujaPagada = await Puja.findOne({
      where: {
        id_usuario: userId,
        estado_puja: "ganadora_pagada",
      },
      include: [
        {
          model: Lote,
          as: "lote",
          where: { id_proyecto: projectId },
          attributes: ["id", "id_proyecto"],
          required: true, // INNER JOIN — descarta pujas sin lote del proyecto
        },
      ],
      attributes: ["id"],
      transaction,
    });

    return !!pujaPagada;
  },

  // -------------------------------------------------------------------
  // FUNCIONES CRUD Y BÚSQUEDA BÁSICAS
  // -------------------------------------------------------------------

  /** @async @function findByIdAndUserId @description Busca una puja activa por ID y ID de usuario. */
  async findByIdAndUserId(id, userId) {
    return Puja.findOne({
      where: { id, id_usuario: userId, activo: true },
      include: [
        {
          model: Usuario,
          as: "usuario",
          attributes: ["id", "nombre", "apellido", "email", "nombre_usuario"],
        },
        {
          model: Lote,
          as: "lote",
          attributes: [
            "id",
            "nombre_lote",
            "precio_base",
            "estado_subasta",
            "id_proyecto",
            "latitud",
            "longitud",
          ],
          include: [
            {
              model: Proyecto,
              as: "proyectoLote",
              attributes: [
                "id",
                "nombre_proyecto",
                "tipo_inversion",
                "estado_proyecto",
                "latitud",
                "longitud",
                "descripcion",
                "monto_inversion",
                "moneda",
              ],
            },
          ],
        },
        {
          model: SuscripcionProyecto,
          as: "suscripcion",
          attributes: ["id", "id_usuario", "id_proyecto", "tokens_disponibles"],
        },
      ],
    });
  },

  /** @async @function findByUserId @description Busca todas las pujas activas de un usuario. */
  async findByUserId(userId) {
    return Puja.findAll({
      where: { id_usuario: userId, activo: true },
      include: [
        {
          model: Usuario,
          as: "usuario",
          attributes: ["id", "nombre", "apellido", "email", "nombre_usuario"],
        },
        {
          model: Lote,
          as: "lote",
          attributes: [
            "id",
            "nombre_lote",
            "precio_base",
            "estado_subasta",
            "id_proyecto",
            "latitud",
            "longitud",
          ],
          include: [
            {
              model: Proyecto,
              as: "proyectoLote",
              attributes: [
                "id",
                "nombre_proyecto",
                "tipo_inversion",
                "estado_proyecto",
                "latitud",
                "longitud",
                "descripcion",
                "monto_inversion",
                "moneda",
              ],
            },
          ],
        },
        {
          model: SuscripcionProyecto,
          as: "suscripcion",
          attributes: ["id", "id_usuario", "id_proyecto", "tokens_disponibles"],
        },
        {
          model: Proyecto,
          as: "proyectoAsociado",
          attributes: [
            "id",
            "nombre_proyecto",
            "tipo_inversion",
            "estado_proyecto",
            "latitud",
            "longitud",
          ],
        },
      ],
      order: [["id", "DESC"]],
    });
  },

  /** @async @function updateByIdAndUserId @description Actualiza una puja por ID y ID de usuario. */
  async updateByIdAndUserId(id, userId, data) {
    const puja = await this.findByIdAndUserId(id, userId);
    if (!puja) return null;
    return puja.update(data);
  },

  /** @async @function softDeleteByIdAndUserId @description Realiza un borrado suave (soft delete) por ID y ID de usuario. */
  async softDeleteByIdAndUserId(id, userId) {
    const puja = await this.findByIdAndUserId(id, userId);
    if (!puja) return null;
    return puja.update({ activo: false });
  },

  /** @async @function findAll @description Obtiene todas las pujas (admin). */
  async findAll() {
    return Puja.findAll({
      include: [
        {
          model: Usuario,
          as: "usuario",
          attributes: ["id", "nombre", "apellido", "email", "nombre_usuario"],
        },
        {
          model: Lote,
          as: "lote",
          attributes: [
            "id",
            "nombre_lote",
            "precio_base",
            "estado_subasta",
            "id_proyecto",
            "latitud",
            "longitud",
          ],
          include: [
            {
              model: Proyecto,
              as: "proyectoLote",
              attributes: [
                "id",
                "nombre_proyecto",
                "tipo_inversion",
                "estado_proyecto",
                "latitud",
                "longitud",
                "descripcion",
              ],
            },
          ],
        },
        {
          model: SuscripcionProyecto,
          as: "suscripcion",
          attributes: ["id", "id_usuario", "id_proyecto", "tokens_disponibles"],
        },
        {
          model: Proyecto,
          as: "proyectoAsociado",
          attributes: [
            "id",
            "nombre_proyecto",
            "tipo_inversion",
            "estado_proyecto",
            "latitud",
            "longitud",
          ],
        },
      ],
      order: [["id", "DESC"]],
    });
  },

  /** @async @function findAllActivo @description Obtiene todas las pujas activas (admin). */
  async findAllActivo() {
    return Puja.findAll({
      where: { activo: true },
      include: [
        {
          model: Usuario,
          as: "usuario",
          attributes: ["id", "nombre", "apellido", "email", "nombre_usuario"],
        },
        {
          model: Lote,
          as: "lote",
          attributes: [
            "id",
            "nombre_lote",
            "precio_base",
            "estado_subasta",
            "id_proyecto",
            "latitud",
            "longitud",
          ],
          include: [
            {
              model: Proyecto,
              as: "proyectoLote",
              attributes: [
                "id",
                "nombre_proyecto",
                "tipo_inversion",
                "estado_proyecto",
                "latitud",
                "longitud",
                "descripcion",
              ],
            },
          ],
        },
        {
          model: SuscripcionProyecto,
          as: "suscripcion",
          attributes: ["id", "id_usuario", "id_proyecto", "tokens_disponibles"],
        },
        {
          model: Proyecto,
          as: "proyectoAsociado",
          attributes: [
            "id",
            "nombre_proyecto",
            "tipo_inversion",
            "estado_proyecto",
            "latitud",
            "longitud",
          ],
        },
      ],
      order: [["id", "DESC"]],
    });
  },

  /** * @async
   * @function findById
   * @description Busca una puja por ID con todas sus asociaciones.
   * @param {number} id - ID de la puja.
   * @param {object} [options={}] - Opciones adicionales (transaction, lock, etc.).
   */
  async findById(id, options = {}) {
    return await Puja.findByPk(id, {
      ...options, // 👈 Importante: permite pasar la transacción y otras configs
      include: [
        {
          model: Usuario,
          as: "usuario",
          attributes: ["id", "nombre", "apellido", "email", "nombre_usuario"],
        },
        {
          model: Lote,
          as: "lote",
          attributes: [
            "id",
            "nombre_lote",
            "precio_base",
            "estado_subasta",
            "id_proyecto",
            "latitud",
            "longitud",
          ],
          include: [
            {
              model: Proyecto,
              as: "proyectoLote",
              attributes: [
                "id",
                "nombre_proyecto",
                "tipo_inversion",
                "estado_proyecto",
                "latitud",
                "longitud",
                "descripcion",
                "monto_inversion",
                "moneda",
              ],
            },
          ],
        },
        {
          model: SuscripcionProyecto,
          as: "suscripcion",
          attributes: ["id", "id_usuario", "id_proyecto", "tokens_disponibles"],
          // Agregamos el proyecto asociado a la suscripción si es necesario para los cálculos de cuotas
          include: [
            {
              association: "proyectoAsociado",
              attributes: [
                "id",
                "monto_inversion",
                "nombre_proyecto",
                "tipo_inversion",
                "estado_proyecto",
              ],
            },
          ],
        },
        {
          model: Proyecto,
          as: "proyectoAsociado",
          attributes: [
            "id",
            "nombre_proyecto",
            "tipo_inversion",
            "estado_proyecto",
            "latitud",
            "longitud",
          ],
        },
      ],
    });
  },

  /** @async @function update @description Actualiza una puja por ID (admin). */
  async update(id, data) {
    const puja = await this.findById(id);
    if (!puja) return null;
    return puja.update(data);
  },

  /** @async @function softDelete @description Realiza un borrado suave por ID (admin). */
  async softDelete(id) {
    const puja = await this.findById(id);
    if (!puja) return null;
    return puja.update({ activo: false });
  },

  /**
   * @async
   * @function cancelarPujaGanadoraAnticipada
   * @description CANCELACIÓN MANUAL por administrador de una puja ganadora_pendiente.
   * @param {number} pujaId - ID de la puja ganadora a cancelar
   * @param {string} motivoCancelacion - Razón administrativa (opcional)
   * @returns {Promise<object>} Resultado de la operación
   */
  async cancelarPujaGanadoraAnticipada(
    pujaId,
    motivoCancelacion = "Cancelación administrativa",
  ) {
    const emailService = require("./email.service");
    const MensajeService = require("./mensaje.service");
    const LoteService = require("./lote.service");

    const SERVICE_NAME = "PujaService.cancelarPujaGanadoraAnticipada";
    const t = await sequelize.transaction();

    try {
      console.log(
        `[${SERVICE_NAME}] Iniciando cancelación de puja ID: ${pujaId}`,
      );

      const pujaGanadora = await Puja.findByPk(pujaId, {
        include: [
          {
            model: Usuario,
            as: "usuario",
          },
          {
            model: Lote,
            as: "lote",
            include: [
              {
                model: Proyecto,
                as: "proyectoLote",
                attributes: [
                  "id",
                  "nombre_proyecto",
                  "tipo_inversion",
                  "estado_proyecto",
                ],
              },
            ],
          },
          {
            model: SuscripcionProyecto,
            as: "suscripcion",
          },
        ],
        transaction: t,
      });

      if (!pujaGanadora) {
        throw {
          statusCode: 404,
          message: `No se encontró la puja con ID ${pujaId}.`,
        };
      }

      if (pujaGanadora.estado_puja !== "ganadora_pendiente") {
        throw {
          statusCode: 400,
          message: `La puja ID ${pujaId} no está en estado 'ganadora_pendiente'. Estado actual: ${pujaGanadora.estado_puja}`,
        };
      }

      const loteId = pujaGanadora.id_lote;
      const usuarioIncumplidor = pujaGanadora.usuario;

      console.log(
        `[${SERVICE_NAME}] ✅ Puja válida. Lote: ${loteId}, Usuario: ${usuarioIncumplidor.id}`,
      );

      await pujaGanadora.update(
        {
          estado_puja: "ganadora_incumplimiento",
          fecha_vencimiento_pago: null,
        },
        { transaction: t },
      );

      console.log(
        `[${SERVICE_NAME}] ✅ Puja ${pujaId} marcada como 'ganadora_incumplimiento'.`,
      );

      // ✅ FIX: Se eliminó la llamada a devolverTokenPorImpago de aquí.
      // La devolución del token ahora ocurre dentro de procesarImpagoLote,
      // evitando el doble incremento y centralizando la lógica.

      const motivoCompleto = `${motivoCancelacion}. Tu puja ganadora ha sido cancelada administrativamente.`;

      await emailService.notificarImpago(usuarioIncumplidor, loteId);
      await MensajeService.enviarMensajeSistema(
        usuarioIncumplidor.id,
        motivoCompleto,
      );

      console.log(
        `[${SERVICE_NAME}] ✅ Usuario ${usuarioIncumplidor.id} notificado.`,
      );

      // procesarImpagoLote se encarga de: marcar la puja como incumplimiento
      // (ya hecho arriba), devolver el token y reasignar al siguiente postor.
      // IMPORTANTE: como la puja ya está en 'ganadora_incumplimiento',
      // procesarImpagoLote no encontrará ninguna 'ganadora_pendiente' para ese lote
      // y pasará directo a buscar el siguiente postor activo.
      await LoteService.procesarImpagoLote(loteId, t);

      console.log(
        `[${SERVICE_NAME}] ✅ Lote ${loteId} procesado para reasignación/limpieza.`,
      );

      await t.commit();

      return {
        success: true,
        message: `Puja ID ${pujaId} cancelada exitosamente. Token devuelto al usuario. Lote procesado.`,
        data: {
          pujaId,
          loteId,
          usuarioAfectado: usuarioIncumplidor.id,
          estadoFinal: "ganadora_incumplimiento",
        },
      };
    } catch (error) {
      await t.rollback();
      console.error(`[${SERVICE_NAME}] ❌ ERROR:`, error.message);
      throw error;
    }
  },

  /**
   * @async
   * @function retirarPuja
   * @description Permite cancelar una puja en estado 'activa' y devolver el token al usuario.
   *
   * REGLAS DE NEGOCIO:
   * - La puja DEBE estar en estado 'activa'
   * - La subasta del lote DEBE estar en estado 'activa'
   * - Puede ser llamada por el propio usuario O por un administrador
   * - Si era la puja más alta, se recalcula cuál es la nueva más alta
   *
   * @param {number} pujaId       - ID de la puja a retirar
   * @param {number} requesterId  - ID del usuario que hace la solicitud
   * @param {boolean} esAdmin     - true si quien ejecuta la acción es administrador
   * @returns {Promise<{ message: string, tokenDevuelto: boolean }>}
   */
  async retirarPuja(pujaId, requesterId, esAdmin = false) {
    const t = await sequelize.transaction();

    try {
      // ── 1. Obtener la puja con su lote y suscripción ──────────────────────
      const puja = await Puja.findByPk(pujaId, {
        include: [
          {
            model: Lote,
            as: "lote",
            attributes: [
              "id",
              "nombre_lote",
              "estado_subasta",
              "id_proyecto",
              "id_puja_mas_alta",
            ],
          },
          {
            model: SuscripcionProyecto,
            as: "suscripcion",
          },
          {
            model: Usuario,
            as: "usuario",
            attributes: ["id", "nombre", "apellido", "email"],
          },
        ],
        transaction: t,
      });

      if (!puja) {
        throw new Error(`Puja ID ${pujaId} no encontrada.`);
      }

      // ── 2. Verificar permisos ─────────────────────────────────────────────
      if (!esAdmin && puja.id_usuario !== requesterId) {
        throw {
          statusCode: 403,
          message: "Acceso denegado. Esta puja no te pertenece.",
        };
      }

      // ── 3. Validar estado de la puja ──────────────────────────────────────
      if (puja.estado_puja !== "activa") {
        throw {
          statusCode: 409,
          message: `No se puede retirar la puja. Estado actual: '${puja.estado_puja}'. Solo se permiten retiros en estado 'activa'.`,
        };
      }

      // ── 4. Validar estado de la subasta del lote ──────────────────────────
      if (!puja.lote) {
        throw new Error("Lote asociado a la puja no encontrado.");
      }

      if (puja.lote.estado_subasta !== "activa") {
        throw {
          statusCode: 409,
          message: `No se puede retirar la puja. La subasta del lote '${puja.lote.nombre_lote}' ya ha ${puja.lote.estado_subasta === "finalizada" ? "finalizado" : "no está activa"}. Tu token permanece retenido según las reglas de la subasta.`,
        };
      }

      // ── 5. Marcar la puja como cancelada ──────────────────────────────────
      await puja.update(
        { estado_puja: "cancelada", activo: false },
        { transaction: t },
      );

      // ── 6. Devolver el token a la suscripción ─────────────────────────────
      let tokenDevuelto = false;

      if (puja.suscripcion) {
        if (puja.suscripcion.tokens_disponibles < 1) {
          await puja.suscripcion.increment("tokens_disponibles", {
            by: 1,
            transaction: t,
          });
          tokenDevuelto = true;
        } else {
          console.warn(
            `⚠️ Suscripción ${puja.suscripcion.id} ya tenía token disponible al retirar puja ${pujaId}`,
          );
          tokenDevuelto = false;
        }
      }

      // ── 7. Si era la puja más alta del lote, recalcular la nueva más alta ─
      const lote = puja.lote;
      if (lote.id_puja_mas_alta === puja.id) {
        const nuevaPujaMasAlta = await Puja.findOne({
          where: {
            id_lote: lote.id,
            estado_puja: "activa",
            id: { [Op.ne]: puja.id },
          },
          order: [["monto_puja", "DESC"]],
          transaction: t,
        });

        await Lote.update(
          { id_puja_mas_alta: nuevaPujaMasAlta ? nuevaPujaMasAlta.id : null },
          { where: { id: lote.id }, transaction: t },
        );
      }

      await t.commit();

      return {
        message: `Puja ID ${pujaId} retirada exitosamente. Token devuelto al usuario.`,
        tokenDevuelto,
        pujaId,
        usuarioAfectado: puja.id_usuario,
        loteId: lote.id,
      };
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },
  /**
   * @async
   * @function findOne
   * @description Busca una puja con criterios de búsqueda arbitrarios.
   * @param {object} options - Opciones de Sequelize ({ where, transaction, ... }).
   * @returns {Promise<Puja|null>}
   */
  async findOne(options = {}) {
    const { where, transaction, ...rest } = options;
    return Puja.findOne({
      where,
      transaction,
      ...rest,
    });
  },
};

module.exports = pujaService;
