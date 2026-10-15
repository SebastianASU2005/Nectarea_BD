// Archivo: services/inversion.service.js

const Inversion = require("../models/inversion");
const Proyecto = require("../models/proyecto");
const Usuario = require("../models/usuario");
const { sequelize } = require("../config/database");
const { Op } = require("sequelize");

/**
 * @typedef {object} InversionData
 * @property {number} id_proyecto - ID del proyecto.
 * @property {number} id_usuario - ID del usuario.
 * @property {number} [monto] - Monto de la inversión (opcional si se toma del proyecto).
 */

/**
 * Servicio de lógica de negocio para la gestión de Inversiones Directas en Proyectos.
 * Se enfoca principalmente en proyectos de tipo 'directo' (inversión única para fondeo total).
 */
const inversionService = {
  /**
   * @async
   * @function crearInversion
   * @description Crea un registro de inversión directa en la BD con estado inicial 'pendiente'.
   * Incluye validación del estado y tipo del proyecto, y se ejecuta en una transacción local.
   * @param {InversionData} data - Datos esenciales de la inversión (id_proyecto, id_usuario).
   * @returns {Promise<Inversion>} La nueva instancia de inversión creada.
   * @throws {Error} Si el proyecto no es apto, no existe, o si hay un error en la transacción.
   */
  async crearInversion(data) {
    const { id_proyecto, id_usuario } = data;
    const usuario = await require("./usuario.service").findById(id_usuario);
    if (usuario && usuario.rol === "admin") {
      throw new Error(
        "⛔ Los administradores no pueden crear inversiones como clientes.",
      );
    }

    const proyecto = await Proyecto.findByPk(id_proyecto);
    if (!proyecto) {
      throw new Error("Proyecto no encontrado.");
    }

    if (
      proyecto.estado_proyecto === "Finalizado" ||
      proyecto.estado_proyecto === "Cancelado"
    ) {
      throw new Error(
        `No se puede crear una inversión, el proyecto "${proyecto.nombre_proyecto}" está en estado: ${proyecto.estado_proyecto}.`,
      );
    }

    if (proyecto.tipo_inversion !== "directo") {
      throw new Error(
        "Solo se pueden crear inversiones directas en proyectos de tipo 'directo'.",
      );
    }

    const montoInversion = proyecto.monto_inversion;
    if (montoInversion === null || typeof montoInversion === "undefined") {
      throw new Error(
        "El monto de inversión del proyecto es nulo. No se puede registrar la inversión.",
      );
    }

    const t = await sequelize.transaction();

    try {
      const nuevaInversion = await Inversion.create(
        {
          id_usuario: id_usuario,
          id_proyecto: id_proyecto,
          monto: montoInversion,
          // ← NUEVO: la inversión hereda la moneda del proyecto (directo → USD)
          moneda: proyecto.moneda === "USD" ? "USD" : "ARS",
          estado: "pendiente",
        },
        { transaction: t },
      );
      await t.commit();

      return nuevaInversion;
    } catch (error) {
      await t.rollback();
      throw new Error(`Error al crear inversión: ${error.message}`);
    }
  },

  /**
   * @async
   * @function confirmarInversion
   * @description Confirma una inversión pendiente a 'pagado', agrega el monto al fondeo (`suscripciones_actuales`)
   * del proyecto, y finaliza el proyecto si es de tipo 'directo'.
   * @param {number} inversionId - ID de la inversión a confirmar.
   * @param {object} t - Objeto de transacción de Sequelize (requerido).
   * @returns {Promise<Inversion>} La instancia de inversión actualizada.
   * @throws {Error} Si la inversión o el proyecto no son encontrados, o si falla la actualización.
   */
  async confirmarInversion(inversionId, t) {
    const inversion = await Inversion.findByPk(inversionId, {
      transaction: t,
      include: [
        {
          model: Usuario,
          as: "inversor",
          attributes: ["id", "nombre", "apellido", "email"],
        },
        {
          model: Proyecto,
          as: "proyectoInvertido",
          attributes: ["id", "nombre_proyecto", "tipo_inversion"],
        },
      ],
    });
    if (!inversion)
      throw new Error("Inversión asociada a la transacción no encontrada.");
    if (inversion.estado === "pagado") return inversion;

    const proyecto = inversion.proyectoInvertido;
    if (!proyecto)
      throw new Error("Proyecto asociado a la inversión no encontrado.");

    // 1. Marcar la inversión como pagada
    inversion.estado = "pagado";
    await inversion.save({ transaction: t });

    // 2. Proyectos "directo": se adjudica automáticamente y se finaliza
    //    (no se toca suscripciones_actuales porque no aplica a este tipo)
    if (proyecto.tipo_inversion === "directo") {
      proyecto.estado_proyecto = "Finalizado";
      await proyecto.save({ transaction: t });

      t.afterCommit(async () => {
        try {
          const emailService = require("./email.service");
          await emailService.notificarInversionDirectaPagada(inversion);
          if (inversion.inversor && inversion.inversor.email) {
            await emailService.notificarInversionPagada(
              inversion.inversor,
              proyecto,
              inversion.monto,
              inversion.moneda, // ← NUEVO
            );
          }
        } catch (err) {
          console.error(
            `Error al notificar sobre inversión ${inversion.id}:`,
            err.message,
          );
        }
      });
    }

    return inversion;
  },
  /**
   * Rechaza inversiones pendientes antiguas de un proyecto.
   * Una inversión "abandonada" es aquella que el usuario creó pero nunca completó
   * el flujo de pago (no confirmó 2FA o no volvió de MercadoPago).
   *
   * Solo rechaza inversiones SIN transacción aprobada (por seguridad).
   *
   * @param {number} proyectoId - ID del proyecto.
   * @param {object} options
   * @param {object} [options.transaction] - Transacción de Sequelize externa.
   * @param {number} [options.minutosMaximos=60] - Antigüedad mínima para considerar abandonada.
   * @returns {Promise<{rechazadas: number, omitidasPorPago: number, ids: number[]}>}
   */
  async rechazarInversionesPendientesAntiguas(proyectoId, options = {}) {
    const Transaccion = require("../models/transaccion");
    const { transaction, minutosMaximos = 60 } = options;
    const t = transaction || (await sequelize.transaction());
    const shouldCommit = !transaction;

    try {
      const fechaLimite = new Date(Date.now() - minutosMaximos * 60 * 1000);

      // 1. Buscar inversiones pendientes antiguas de este proyecto
      const inversionesAntiguas = await Inversion.findAll({
        where: {
          id_proyecto: proyectoId,
          estado: "pendiente",
          createdAt: { [Op.lt]: fechaLimite },
        },
        attributes: ["id"],
        transaction: t,
      });

      if (inversionesAntiguas.length === 0) {
        if (shouldCommit) await t.commit();
        return { rechazadas: 0, omitidasPorPago: 0, ids: [] };
      }

      const idsInversiones = inversionesAntiguas.map((i) => i.id);

      // 2. Verificación de seguridad: descartar las que tengan pago aprobado
      //    (por si el webhook llegó pero el estado no se actualizó todavía)
      const transaccionesPagadas = await Transaccion.findAll({
        where: {
          id_inversion: { [Op.in]: idsInversiones },
          estado_transaccion: "pagado",
        },
        attributes: ["id_inversion"],
        transaction: t,
      });
      const idsConPago = new Set(
        transaccionesPagadas.map((tx) => tx.id_inversion),
      );

      const idsARechazar = idsInversiones.filter((id) => !idsConPago.has(id));

      if (idsARechazar.length > 0) {
        // 3. Marcar las inversiones como fallidas
        await Inversion.update(
          { estado: "fallido" },
          {
            where: { id: { [Op.in]: idsARechazar } },
            transaction: t,
          },
        );

        // 4. Expirar sus transacciones pendientes (si las tuvieran)
        await Transaccion.update(
          {
            estado_transaccion: "expirado",
            error_detalle: `Auto-expirado: inversión pendiente por más de ${minutosMaximos} min`,
          },
          {
            where: {
              id_inversion: { [Op.in]: idsARechazar },
              estado_transaccion: {
                [Op.in]: ["pendiente", "en_proceso", "fallido"],
              },
            },
            transaction: t,
          },
        );
      }

      if (shouldCommit) await t.commit();

      return {
        rechazadas: idsARechazar.length,
        omitidasPorPago: idsConPago.size,
        ids: idsARechazar,
      };
    } catch (error) {
      if (shouldCommit) await t.rollback();
      console.error(
        `[rechazarInversionesPendientesAntiguas] Error:`,
        error.message,
      );
      throw error;
    }
  },
  // --- Funciones CRUD básicas ---

  /**
   * @async
   * @function findById
   * @description Obtiene una inversión por su clave primaria (ID).
   * @param {number} id - ID de la inversión.
   * @returns {Promise<Inversion|null>} La inversión encontrada o `null`.
   */
  async findById(id) {
    return await Inversion.findByPk(id, {
      include: [
        {
          model: Usuario,
          as: "inversor",
          attributes: ["id", "nombre", "apellido", "email", "nombre_usuario"],
        },
        {
          model: Proyecto,
          as: "proyectoInvertido",
          attributes: [
            "id",
            "nombre_proyecto",
            "tipo_inversion",
            "estado_proyecto",
            "monto_inversion",
          ],
        },
      ],
    });
  },

  /**
   * @async
   * @function findAll
   * @description Obtiene todos los registros de inversiones (incluye inactivas).
   * @returns {Promise<Inversion[]>} Lista de todas las inversiones.
   */
  async findAll() {
    return await Inversion.findAll({
      include: [
        {
          model: Usuario,
          as: "inversor",
          attributes: ["id", "nombre", "apellido", "email", "nombre_usuario"],
        },
        {
          model: Proyecto,
          as: "proyectoInvertido",
          attributes: [
            "id",
            "nombre_proyecto",
            "tipo_inversion",
            "estado_proyecto",
            "monto_inversion",
          ],
        },
      ],
      order: [["id", "DESC"]],
    });
  },

  /**
   * @async
   * @function findByUserId
   * @description Obtiene todas las inversiones de un usuario específico.
   * @param {number} userId - ID del usuario.
   * @returns {Promise<Inversion[]>} Lista de inversiones del usuario.
   */
  async findByUserId(userId) {
    return await Inversion.findAll({
      where: {
        id_usuario: userId,
      },
      include: [
        {
          model: Usuario,
          as: "inversor",
          attributes: ["id", "nombre", "apellido", "email", "nombre_usuario"],
        },
        {
          model: Proyecto,
          as: "proyectoInvertido",
          attributes: [
            "id",
            "nombre_proyecto",
            "tipo_inversion",
            "estado_proyecto",
            "monto_inversion",
          ],
        },
      ],
      order: [["id", "DESC"]],
    });
  },

  /**
   * @async
   * @function findAllActivo
   * @description Obtiene todas las inversiones que no están eliminadas lógicamente (`activo: true`).
   * @returns {Promise<Inversion[]>} Lista de inversiones activas.
   */
  async findAllActivo() {
    return await Inversion.findAll({
      where: {
        activo: true,
      },
      include: [
        {
          model: Usuario,
          as: "inversor",
          attributes: ["id", "nombre", "apellido", "email", "nombre_usuario"],
        },
        {
          model: Proyecto,
          as: "proyectoInvertido",
          attributes: [
            "id",
            "nombre_proyecto",
            "tipo_inversion",
            "estado_proyecto",
            "monto_inversion",
          ],
        },
      ],
      order: [["id", "DESC"]],
    });
  },

  /**
   * @async
   * @function update
   * @description Actualiza los datos de una inversión por ID.
   * @param {number} id - ID de la inversión a actualizar.
   * @param {object} data - Datos a actualizar.
   * @returns {Promise<Inversion|null>} La inversión actualizada o `null` si no se encuentra.
   */
  async update(id, data) {
    const inversion = await Inversion.findByPk(id);
    if (!inversion) return null;
    return await inversion.update(data);
  },

  /**
   * @async
   * @function softDelete
   * @description Realiza una eliminación lógica (soft delete) al marcar la inversión como inactiva (`activo = false`).
   * @param {number} id - ID de la inversión a inactivar.
   * @returns {Promise<Inversion|null>} La inversión actualizada (inactiva) o `null` si no se encuentra.
   */
  async softDelete(id) {
    const inversion = await Inversion.findByPk(id);
    if (!inversion) return null;
    return await inversion.update({
      activo: false,
    });
  },

  // -------------------------------------------------------------------
  // 📊 FUNCIONES DE REPORTE Y MÉTRICAS (KPIs)
  // -------------------------------------------------------------------

  /**
   * Calcula la Tasa de Liquidez de Inversiones (KPI 6) filtrando por rango de fechas (createdAt).
   *
   * ⚠️ CAMBIO DE CONTRATO: antes devolvía un objeto plano con los totales de
   * TODAS las monedas sumadas (lo cual era incorrecto: sumaba USD + ARS).
   * Ahora devuelve un array con una fila por moneda.
   *
   * @param {Date|null} fechaInicio
   * @param {Date|null} fechaFin
   * @returns {Promise<Array<{moneda: string, total_invertido_registrado: string, total_pagado: string, tasa_liquidez: string}>>}
   */
  async getInvestmentLiquidityRate(fechaInicio = null, fechaFin = null) {
    const where = { activo: true };
    if (fechaInicio) where.createdAt = { [Op.gte]: fechaInicio };
    if (fechaFin) where.createdAt = { ...where.createdAt, [Op.lte]: fechaFin };

    // ← NUEVO: agrupar por moneda. Los montos de monedas distintas NO se suman.
    const filas = await Inversion.findAll({
      attributes: [
        "moneda",
        [sequelize.fn("SUM", sequelize.col("monto")), "total_registrado"],
        [
          sequelize.literal(
            "COALESCE(SUM(CASE WHEN estado = 'pagado' THEN monto ELSE 0 END), 0)",
          ),
          "total_pagado",
        ],
      ],
      where,
      group: ["moneda"],
      order: [["moneda", "ASC"]],
      raw: true,
    });

    return filas.map((fila) => {
      const totalInvertido = Number(fila.total_registrado) || 0;
      const totalPagado = Number(fila.total_pagado) || 0;
      const tasa =
        totalInvertido > 0 ? (totalPagado / totalInvertido) * 100 : 0;
      return {
        moneda: fila.moneda,
        total_invertido_registrado: totalInvertido.toFixed(2),
        total_pagado: totalPagado.toFixed(2),
        tasa_liquidez: tasa.toFixed(2),
      };
    });
  },

  /**
   * Agrega monto total invertido (estado pagado) por usuario y moneda, opcionalmente filtrando por rango de fechas.
   *
   * ⚠️ CAMBIO DE CONTRATO: ahora agrupa por id_usuario + moneda, así que un usuario
   * puede tener varias filas si invirtió en proyectos USD y ARS.
   *
   * @param {Date|null} fechaInicio
   * @param {Date|null} fechaFin
   * @returns {Promise<Array<{id_usuario: number, moneda: string, monto_total_invertido: string}>>}
   */
  async getAggregatedInvestmentByUser(fechaInicio = null, fechaFin = null) {
    const where = { estado: "pagado", activo: true };
    if (fechaInicio) where.createdAt = { [Op.gte]: fechaInicio };
    if (fechaFin) where.createdAt = { ...where.createdAt, [Op.lte]: fechaFin };

    const aggregated = await Inversion.findAll({
      attributes: [
        "id_usuario",
        "moneda", // ← NUEVO
        [sequelize.fn("SUM", sequelize.col("monto")), "monto_total_invertido"],
      ],
      where,
      group: ["id_usuario", "moneda"], // ← NUEVO
      order: [
        ["moneda", "ASC"], // ← NUEVO
        [sequelize.literal("monto_total_invertido"), "DESC"],
      ],
      raw: true,
    });

    return aggregated.map((item) => ({
      id_usuario: item.id_usuario,
      moneda: item.moneda, // ← NUEVO
      monto_total_invertido: parseFloat(item.monto_total_invertido).toFixed(2),
    }));
  },
};

module.exports = inversionService;
