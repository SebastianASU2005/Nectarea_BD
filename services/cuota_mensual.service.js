// services/cuotaMensualService.js
const CuotaMensual = require("../models/CuotaMensual");
const Proyecto = require("../models/proyecto");
const { sequelize } = require("../config/database");

/**
 * Servicio de lógica de negocio para la gestión y el cálculo de Cuotas Mensuales.
 * CRÍTICO: Asegura que la creación/actualización de una cuota se refleje correctamente
 * en el campo `monto_inversion` del Proyecto asociado, utilizando **transacciones** para garantizar la atomicidad.
 */
const cuotaMensualService = {
  /**
   * Función privada que calcula el valor total de la cuota mensual
   * basado en el valor del cemento, unidades y los porcentajes aplicables.
   * Los resultados son redondeados a dos decimales para manejo financiero.
   * @param {object} data - Datos necesarios para el cálculo.
   * @returns {object} Objeto con todos los valores calculados y redondeados.
   */
  _calculateValues(data) {
    const porcentaje_plan = parseFloat(data.porcentaje_plan);
    const porcentaje_administrativo = parseFloat(
      data.porcentaje_administrativo
    );
    const porcentaje_iva = parseFloat(data.porcentaje_iva);

    // 1. Calcular el valor_movil (Base del cálculo: Unidades * Valor por unidad)
    const valor_movil = data.valor_cemento_unidades * data.valor_cemento;

    // 2. Calcular los componentes de la cuota
    const total_del_plan = valor_movil * (porcentaje_plan / 100);
    // Valor sin cargos: se divide el total del plan por el plazo de inversión.
    const valor_mensual = total_del_plan / data.total_cuotas_proyecto;

    const carga_administrativa =
      valor_movil * (porcentaje_administrativo / 100);
    const iva_carga_administrativa =
      carga_administrativa * (porcentaje_iva / 100);

    // Valor mensual final que debe pagar el inversionista.
    const valor_mensual_final =
      valor_mensual + carga_administrativa + iva_carga_administrativa;

    // Retorna todos los valores calculados y redondeados a 2 decimales para precisión monetaria.
    return {
      valor_movil: parseFloat(valor_movil.toFixed(2)),
      total_del_plan: parseFloat(total_del_plan.toFixed(2)),
      valor_mensual: parseFloat(valor_mensual.toFixed(2)),
      carga_administrativa: parseFloat(carga_administrativa.toFixed(2)),
      iva_carga_administrativa: parseFloat(iva_carga_administrativa.toFixed(2)),
      valor_mensual_final: parseFloat(valor_mensual_final.toFixed(2)),
    };
  },

  /**
   * Crea una nueva cuota mensual (calculando todos sus valores) y
   * **actualiza el Proyecto asociado** con el `valor_mensual_final` resultante.
   * Ambas operaciones se ejecutan en una **transacción** para asegurar la coherencia (atomicidad).
   * @param {object} data - Datos para la cuota (incluye id_proyecto).
   * @returns {Promise<CuotaMensual>} La nueva cuota creada.
   * @throws {Error} Si el proyecto no existe o no tiene `plazo_inversion`.
   */
  async createAndSetProjectAmount(data) {
    const t = await sequelize.transaction(); // Inicia la transacción
    try {
      // 1. Obtener el Proyecto para el plazo de inversión (total de cuotas).
      const proyecto = await Proyecto.findByPk(data.id_proyecto, {
        transaction: t,
      });

      if (!proyecto) {
        throw new Error("El proyecto especificado no fue encontrado.");
      }

      // 2. Extracción crítica del plazo de inversión.
      const totalCuotasProyecto = proyecto.plazo_inversion;

      if (!totalCuotasProyecto) {
        throw new Error(
          "El proyecto no tiene definido el número total de cuotas ('plazo_inversion')."
        );
      }

      // 3. Preparar los datos y calcular los valores.
      const completeData = {
        ...data,
        total_cuotas_proyecto: totalCuotasProyecto,
      };

      const calculatedValues = this._calculateValues(completeData);

      // 4. Crear la nueva cuota (dentro de la transacción).
      const nuevaCuota = await CuotaMensual.create(
        {
          id_proyecto: completeData.id_proyecto,
          nombre_proyecto: completeData.nombre_proyecto,
          nombre_cemento: completeData.nombre_cemento_cemento,
          valor_cemento_unidades: completeData.valor_cemento_unidades,
          valor_cemento: completeData.valor_cemento,
          total_cuotas_proyecto: completeData.total_cuotas_proyecto,
          porcentaje_plan: completeData.porcentaje_plan,
          porcentaje_administrativo: completeData.porcentaje_administrativo,
          porcentaje_iva: completeData.porcentaje_iva,
          ...calculatedValues, // Incluye todos los valores calculados
        },
        { transaction: t }
      );

      // 5. Actualiza el `monto_inversion` del proyecto con el valor final de la cuota (dentro de la transacción).
      await Proyecto.update(
        { monto_inversion: calculatedValues.valor_mensual_final },
        { where: { id: data.id_proyecto }, transaction: t }
      );

      await t.commit(); // Confirma la transacción
      return nuevaCuota;
    } catch (primaryError) {
      // Manejo de errores: Intenta el rollback en caso de fallo.
      try {
        if (t && t.finished !== "rollback") {
          await t.rollback();
        }
      } catch (rollbackError) {
        // Se ignora el error del rollback.
      }
      throw primaryError; // Re-lanza el error original de negocio o sistema.
    }
  },

  /**
   * Actualiza una cuota por su ID, recalcula sus valores y actualiza el proyecto asociado.
   * Ejecuta la lógica dentro de una **transacción**.
   * @param {number} id - ID de la cuota a actualizar.
   * @param {object} data - Nuevos datos para el recálculo.
   * @returns {Promise<CuotaMensual|null>} La cuota actualizada o null si no se encuentra.
   */
  async update(id, data) {
    const t = await sequelize.transaction();
    try {
      const cuota = await CuotaMensual.findByPk(id, { transaction: t });
      if (!cuota) {
        await t.rollback();
        return null;
      }

      // 1. Determinar el `total_cuotas_proyecto` (tomando el valor del request, del proyecto o el valor histórico).
      if (!data.total_cuotas_proyecto) {
        const proyecto = await Proyecto.findByPk(cuota.id_proyecto, {
          transaction: t,
        });
        if (proyecto && proyecto.plazo_inversion) {
          data.total_cuotas_proyecto = proyecto.plazo_inversion;
        } else {
          data.total_cuotas_proyecto = cuota.total_cuotas_proyecto;
        }
      }

      // 2. Combina datos históricos y datos de actualización para el cálculo.
      const mergedData = { ...cuota.dataValues, ...data };

      // 3. Recalcular los valores financieros.
      const calculatedValues = this._calculateValues(mergedData);

      // 4. Actualizar la cuota.
      await cuota.update(
        {
          ...mergedData,
          ...calculatedValues,
        },
        { transaction: t }
      );

      // 5. Actualiza el `monto_inversion` del proyecto asociado (CRÍTICO).
      await Proyecto.update(
        { monto_inversion: calculatedValues.valor_mensual_final },
        { where: { id: cuota.id_proyecto }, transaction: t }
      );

      await t.commit();
      return cuota;
    } catch (primaryError) {
      // Manejo de errores: rollback.
      try {
        if (t && t.finished !== "rollback") {
          await t.rollback();
        }
      } catch (rollbackError) {
        // Se ignora el error del rollback.
      }
      throw primaryError;
    }
  },

  /**
   * Obtiene todas las cuotas de un proyecto específico.
   * @param {number} id_proyecto - ID del proyecto.
   * @returns {Promise<CuotaMensual[]>} Arreglo de cuotas.
   */
  async findByProjectId(id_proyecto) {
    return CuotaMensual.findAll({
      where: { id_proyecto: id_proyecto },
      order: [["createdAt", "DESC"]],
    });
  },

  /**
   * Obtiene la cuota más reciente creada para un proyecto (la versión activa actual).
   * @param {number} id_proyecto - ID del proyecto.
   * @returns {Promise<CuotaMensual|null>} La última cuota o null si no existe.
   */
  async findLastByProjectId(id_proyecto) {
    return CuotaMensual.findOne({
      where: { id_proyecto: id_proyecto },
      order: [["createdAt", "DESC"]],
      limit: 1,
    });
  },

  /**
   * Elimina lógicamente una cuota (establece `activo` en false).
   * @param {number} id - ID de la cuota.
   * @returns {Promise<CuotaMensual|null>} La cuota actualizada o null si no se encuentra.
   */
  async softDelete(id) {
    const cuota = await CuotaMensual.findByPk(id);
    if (!cuota) {
      return null;
    }
    // Solo marca como inactiva; la eliminación física no es recomendada para datos financieros históricos.
    await cuota.update({ activo: false });
    return cuota;
  },
};

module.exports = cuotaMensualService;
