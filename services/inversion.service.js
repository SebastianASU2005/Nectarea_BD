// Archivo: services/inversion.service.js

const Inversion = require("../models/inversion");
const Proyecto = require("../models/proyecto");
const Usuario = require("../models/usuario");
const SuscripcionProyecto = require("../models/suscripcion_proyecto");
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
    });
    if (!inversion) {
      throw new Error("Inversión asociada a la transacción no encontrada.");
    }
    if (inversion.estado === "pagado") {
      return inversion;
    }

    const proyecto = await Proyecto.findByPk(inversion.id_proyecto, {
      transaction: t,
    });
    if (!proyecto) {
      throw new Error("Proyecto asociado a la inversión no encontrado.");
    }

    const montoInvertido = Number(inversion.monto);
    const montoActual = Number(proyecto.suscripciones_actuales || 0);
    const nuevoMontoTotal = montoActual + montoInvertido;

    await proyecto.update(
      {
        suscripciones_actuales: nuevoMontoTotal,
      },
      { transaction: t },
    );

    inversion.estado = "pagado";
    await inversion.save({
      transaction: t,
    });

    if (proyecto.tipo_inversion === "directo") {
      proyecto.estado_proyecto = "Finalizado";
      await proyecto.save({
        transaction: t,
      });
    }

    return inversion;
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
        {
          model: SuscripcionProyecto,
          as: "suscripcion",
          attributes: ["id", "id_usuario", "id_proyecto", "monto_total_pagado"],
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
        {
          model: SuscripcionProyecto,
          as: "suscripcion",
          attributes: ["id", "id_usuario", "id_proyecto", "monto_total_pagado"],
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
        {
          model: SuscripcionProyecto,
          as: "suscripcion",
          attributes: ["id", "id_usuario", "id_proyecto", "monto_total_pagado"],
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
        {
          model: SuscripcionProyecto,
          as: "suscripcion",
          attributes: ["id", "id_usuario", "id_proyecto", "monto_total_pagado"],
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
   * @async
   * @function getInvestmentLiquidityRate
   * @description Calcula la **Tasa de Liquidez de Inversiones** (KPI 6).
   * Mide la proporción de inversiones registradas (pendientes/pagadas) que se concretan (pagadas).
   * Fórmula: (Total Pagado / Total Registrado) * 100.
   * @returns {Promise<object>} Objeto con las métricas: total registrado, total pagado, y tasa de liquidez (%).
   */
  async getInvestmentLiquidityRate() {
    const totalInvertidoResult = await Inversion.sum("monto", {
      where: { activo: true },
    });
    const totalInvertido = Number(totalInvertidoResult) || 0;

    if (totalInvertido === 0) {
      return {
        total_invertido_registrado: 0.0,
        total_pagado: 0.0,
        tasa_liquidez: 0.0,
      };
    }

    const totalPagadoResult = await Inversion.sum("monto", {
      where: { estado: "pagado", activo: true },
    });
    const totalPagado = Number(totalPagadoResult) || 0;

    const tasaLiquidez = (totalPagado / totalInvertido) * 100;

    return {
      total_invertido_registrado: totalInvertido.toFixed(2),
      total_pagado: totalPagado.toFixed(2),
      tasa_liquidez: tasaLiquidez.toFixed(2),
    };
  },

  /**
   * @async
   * @function getAggregatedInvestmentByUser
   * @description Agrega el monto total invertido (solo `estado: 'pagado'`) por cada usuario.
   * Sirve de base para el cálculo del Rendimiento del Inversor (KPI 7).
   * @returns {Promise<object[]>} Lista de objetos con `id_usuario` y `monto_total_invertido` (pagado).
   */
  async getAggregatedInvestmentByUser() {
    const aggregatedInvestments = await Inversion.findAll({
      attributes: [
        "id_usuario",
        [sequelize.fn("SUM", sequelize.col("monto")), "monto_total_invertido"],
      ],
      where: {
        estado: "pagado",
        activo: true,
      },
      group: ["id_usuario"],
      order: [[sequelize.literal("monto_total_invertido"), "DESC"]],
      raw: true,
    });

    return aggregatedInvestments.map((item) => ({
      id_usuario: item.id_usuario,
      monto_total_invertido: parseFloat(item.monto_total_invertido).toFixed(2),
    }));
  },
};

module.exports = inversionService;
