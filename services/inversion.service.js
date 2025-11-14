// Archivo: services/inversion.service.js

const Inversion = require("../models/inversion");
const Proyecto = require("../models/proyecto");
const { sequelize } = require("../config/database");
const { Op } = require("sequelize"); // Se mantiene para el uso potencial de operadores avanzados de Sequelize.

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
    const { id_proyecto, id_usuario } = data; // 1. Validar que el Proyecto exista.
    const usuario = await require("./usuario.service").findById(id_usuario);
    if (usuario && usuario.rol === "admin") {
      throw new Error(
        "⛔ Los administradores no pueden crear inversiones como clientes."
      );
    }

    const proyecto = await Proyecto.findByPk(id_proyecto);
    if (!proyecto) {
      throw new Error("Proyecto no encontrado.");
    } // 2. Restricciones de estado: No se permite invertir en proyectos finalizados o cancelados.

    if (
      proyecto.estado_proyecto === "Finalizado" ||
      proyecto.estado_proyecto === "Cancelado"
    ) {
      throw new Error(
        `No se puede crear una inversión, el proyecto "${proyecto.nombre_proyecto}" está en estado: ${proyecto.estado_proyecto}.`
      );
    } // 3. Restricción de tipo de inversión: Este servicio solo maneja el tipo "directo".

    if (proyecto.tipo_inversion !== "directo") {
      throw new Error(
        "Solo se pueden crear inversiones directas en proyectos de tipo 'directo'."
      );
    } // 4. Validar el monto de inversión que debe venir del proyecto.

    const montoInversion = proyecto.monto_inversion;
    if (montoInversion === null || typeof montoInversion === "undefined") {
      throw new Error(
        "El monto de inversión del proyecto es nulo. No se puede registrar la inversión."
      );
    } // Iniciar una transacción local para asegurar la atomicidad de la creación.

    const t = await sequelize.transaction();

    try {
      // 5. Crear la inversión con el monto definido del proyecto y estado "pendiente".
      const nuevaInversion = await Inversion.create(
        {
          id_usuario: id_usuario,
          id_proyecto: id_proyecto,
          monto: montoInversion,
          estado: "pendiente",
        },
        { transaction: t }
      );
      await t.commit(); // Confirmar la creación.

      return nuevaInversion;
    } catch (error) {
      await t.rollback(); // Deshacer si falla.
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
   */ async confirmarInversion(inversionId, t) {
    // 1. Encontrar la inversión y verificar estado.
    const inversion = await Inversion.findByPk(inversionId, {
      transaction: t,
    });
    if (!inversion) {
      throw new Error("Inversión asociada a la transacción no encontrada.");
    }
    if (inversion.estado === "pagado") {
      return inversion; // Idempotencia: No hacer nada si ya está pagada.
    } // 2. Encontrar el proyecto asociado.

    const proyecto = await Proyecto.findByPk(inversion.id_proyecto, {
      transaction: t,
    });
    if (!proyecto) {
      throw new Error("Proyecto asociado a la inversión no encontrado.");
    } // 3. Actualizar el monto de fondeo del proyecto (`suscripciones_actuales`).

    const montoInvertido = Number(inversion.monto);
    const montoActual = Number(proyecto.suscripciones_actuales || 0);
    const nuevoMontoTotal = montoActual + montoInvertido;

    await proyecto.update(
      {
        suscripciones_actuales: nuevoMontoTotal,
      },
      { transaction: t }
    ); // 4. Marcar la inversión como 'pagado'.

    inversion.estado = "pagado";
    await inversion.save({
      transaction: t,
    }); // 5. Lógica para proyectos directos: Si es inversión única, se finaliza tras el pago.

    if (proyecto.tipo_inversion === "directo") {
      proyecto.estado_proyecto = "Finalizado";
      await proyecto.save({
        transaction: t,
      });
    }

    return inversion;
  }, // --- Funciones CRUD básicas ---
  /**
   * @async
   * @function findById
   * @description Obtiene una inversión por su clave primaria (ID).
   * @param {number} id - ID de la inversión.
   * @returns {Promise<Inversion|null>} La inversión encontrada o `null`.
   */ async findById(id) {
    return await Inversion.findByPk(id);
  },
  /**
   * @async
   * @function findAll
   * @description Obtiene todos los registros de inversiones (incluye inactivas).
   * @returns {Promise<Inversion[]>} Lista de todas las inversiones.
   */ async findAll() {
    return await Inversion.findAll();
  },
  /**
   * @async
   * @function findByUserId
   * @description Obtiene todas las inversiones de un usuario específico.
   * @param {number} userId - ID del usuario.
   * @returns {Promise<Inversion[]>} Lista de inversiones del usuario.
   */ async findByUserId(userId) {
    return await Inversion.findAll({
      where: {
        id_usuario: userId,
      },
    });
  },
  /**
   * @async
   * @function findAllActivo
   * @description Obtiene todas las inversiones que no están eliminadas lógicamente (`activo: true`).
   * @returns {Promise<Inversion[]>} Lista de inversiones activas.
   */ async findAllActivo() {
    return await Inversion.findAll({
      where: {
        activo: true,
      },
    });
  },
  /**
   * @async
   * @function update
   * @description Actualiza los datos de una inversión por ID.
   * @param {number} id - ID de la inversión a actualizar.
   * @param {object} data - Datos a actualizar.
   * @returns {Promise<Inversion|null>} La inversión actualizada o `null` si no se encuentra.
   */ async update(id, data) {
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
   */ async softDelete(id) {
    const inversion = await Inversion.findByPk(id);
    if (!inversion) return null;
    return await inversion.update({
      activo: false,
    });
  }, // ------------------------------------------------------------------- // 📊 FUNCIONES DE REPORTE Y MÉTRICAS (KPIs) // -------------------------------------------------------------------
  /**
   * @async
   * @function getInvestmentLiquidityRate
   * @description Calcula la **Tasa de Liquidez de Inversiones** (KPI 6).
   * Mide la proporción de inversiones registradas (pendientes/pagadas) que se concretan (pagadas).
   * Fórmula: (Total Pagado / Total Registrado) * 100.
   * @returns {Promise<object>} Objeto con las métricas: total registrado, total pagado, y tasa de liquidez (%).
   */ async getInvestmentLiquidityRate() {
    // 1. Calcular el monto total de todas las inversiones registradas y activas.
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
    } // 2. Calcular el monto total de inversiones efectivamente pagadas y activas.

    const totalPagadoResult = await Inversion.sum("monto", {
      where: { estado: "pagado", activo: true },
    });
    const totalPagado = Number(totalPagadoResult) || 0; // 3. Calcular la Tasa de Liquidez (KPI 6).

    const tasaLiquidez = (totalPagado / totalInvertido) * 100;

    return {
      total_invertido_registrado: totalInvertido.toFixed(2),
      total_pagado: totalPagado.toFixed(2),
      tasa_liquidez: tasaLiquidez.toFixed(2), // Porcentaje con 2 decimales.
    };
  },
  /**
   * @async
   * @function getAggregatedInvestmentByUser
   * @description Agrega el monto total invertido (solo `estado: 'pagado'`) por cada usuario.
   * Sirve de base para el cálculo del Rendimiento del Inversor (KPI 7).
   * @returns {Promise<object[]>} Lista de objetos con `id_usuario` y `monto_total_invertido` (pagado).
   */ async getAggregatedInvestmentByUser() {
    // Usamos `findAll` con GROUP BY y SUM para realizar la agregación SQL.
    const aggregatedInvestments = await Inversion.findAll({
      attributes: [
        "id_usuario", // Aplicar la función de agregación SUM al campo 'monto'.
        [sequelize.fn("SUM", sequelize.col("monto")), "monto_total_invertido"],
      ],
      where: {
        estado: "pagado", // Condición clave: Solo sumar inversiones que fueron pagadas.
        activo: true,
      },
      group: ["id_usuario"], // Agrupa los resultados por el ID del usuario.
      order: [
        [sequelize.literal("monto_total_invertido"), "DESC"], // Ordenar por el monto total invertido de forma descendente.
      ],
      raw: true, // Retornar resultados planos para facilitar el mapeo.
    }); // Formatear a números con 2 decimales para la presentación.

    return aggregatedInvestments.map((item) => ({
      id_usuario: item.id_usuario,
      monto_total_invertido: parseFloat(item.monto_total_invertido).toFixed(2),
    }));
  },
};

module.exports = inversionService;
