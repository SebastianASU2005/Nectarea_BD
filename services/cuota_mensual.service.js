// services/cuotaMensualService.js
const CuotaMensual = require("../models/CuotaMensual");
const Proyecto = require("../models/proyecto");
const ResumenCuenta = require("../models/resumen_cuenta");
const SuscripcionProyecto = require("../models/suscripcion_proyecto");
const { sequelize } = require("../config/database");

/**
 * Servicio de lógica de negocio para la gestión y el cálculo de Cuotas Mensuales.
 * CRÍTICO: Asegura que la creación/actualización de una cuota se refleje correctamente
 * en el campo `monto_inversion` del Proyecto asociado, utilizando **transacciones** para garantizar la atomicidad.
 * 🆕 NUEVO: También actualiza automáticamente todos los ResumenCuenta asociados al proyecto.
 */
const cuotaMensualService = {
  /**
   * Función privada que calcula el valor total de la cuota mensual
   * basado en el valor del cemento, unidades y los porcentajes aplicables.
   */
  _calculateValues(data) {
    // Convertimos a float
    const porcentaje_plan = parseFloat(data.porcentaje_plan);
    const porcentaje_administrativo = parseFloat(
      data.porcentaje_administrativo
    );
    const porcentaje_iva = parseFloat(data.porcentaje_iva);

    // 1. Valor Movil Total
    const valor_movil = data.valor_cemento_unidades * data.valor_cemento;

    // 2. Valor Mensual "FULL" (El 100% de la cuota si no tuviera plan)
    // Usamos esto como BASE para calcular la administración
    const valor_mensual_full = valor_movil / data.total_cuotas_proyecto;

    // 3. Valor Mensual del Plan (El capital real que paga el cliente: 85%)
    const total_del_plan = valor_movil * (porcentaje_plan / 100);
    const valor_mensual_plan = total_del_plan / data.total_cuotas_proyecto;

    // 4. Carga Administrativa (19% sobre el valor FULL, no sobre el plan)
    // CORRECCIÓN CLAVE AQUÍ 👇
    const carga_administrativa =
      valor_mensual_full * (porcentaje_administrativo / 100);

    // 5. IVA (21% sobre la carga administrativa)
    const iva_carga_administrativa =
      carga_administrativa * (porcentaje_iva / 100);

    // 6. Total Final
    const valor_mensual_final =
      valor_mensual_plan + carga_administrativa + iva_carga_administrativa;

    return {
      valor_movil: parseFloat(valor_movil.toFixed(2)),
      total_del_plan: parseFloat(total_del_plan.toFixed(2)),

      // Guardamos la cuota del plan (lo que amortiza capital)
      valor_mensual: parseFloat(valor_mensual_plan.toFixed(2)),

      carga_administrativa: parseFloat(carga_administrativa.toFixed(2)),
      iva_carga_administrativa: parseFloat(iva_carga_administrativa.toFixed(2)),
      valor_mensual_final: parseFloat(valor_mensual_final.toFixed(2)),
    };
  },

  /**
   * 🆕 NUEVA FUNCIÓN: Actualiza todos los ResumenCuenta asociados a un proyecto
   * con los nuevos valores de la CuotaMensual.
   * @param {number} id_proyecto - ID del proyecto
   * @param {object} calculatedValues - Valores calculados de la cuota
   * @param {object} cuotaData - Datos completos de la cuota
   * @param {object} transaction - Transacción de Sequelize
   * @returns {Promise<number>} Cantidad de resúmenes actualizados
   */
  async _syncResumenesCuenta(
    id_proyecto,
    calculatedValues,
    cuotaData,
    transaction
  ) {
    try {
      // 1. Buscar todas las suscripciones activas del proyecto
      const suscripciones = await SuscripcionProyecto.findAll({
        where: {
          id_proyecto: id_proyecto,
          activo: true,
        },
        attributes: ["id"],
        transaction,
      });

      if (suscripciones.length === 0) {
        console.log(
          `⚠️ No hay suscripciones activas para el proyecto ${id_proyecto}`
        );
        return 0;
      }

      const idsSuscripciones = suscripciones.map((s) => s.id);

      // 2. Construir el nuevo detalle_cuota
      const nuevoDetalleCuota = {
        nombre_cemento: cuotaData.nombre_cemento_cemento,
        valor_cemento_unidades: cuotaData.valor_cemento_unidades,
        valor_cemento: parseFloat(cuotaData.valor_cemento),
        porcentaje_plan: parseFloat(cuotaData.porcentaje_plan),
        valor_movil: calculatedValues.valor_movil,
        valor_mensual: calculatedValues.valor_mensual,
        carga_administrativa: calculatedValues.carga_administrativa,
        iva_carga_administrativa: calculatedValues.iva_carga_administrativa,
        valor_mensual_final: calculatedValues.valor_mensual_final,
      };

      // 3. Actualizar todos los ResumenCuenta asociados
      const [cantidadActualizada] = await ResumenCuenta.update(
        {
          detalle_cuota: nuevoDetalleCuota,
          meses_proyecto: cuotaData.total_cuotas_proyecto,
        },
        {
          where: {
            id_suscripcion: idsSuscripciones,
          },
          transaction,
        }
      );

      console.log(
        `✅ Se actualizaron ${cantidadActualizada} resúmenes de cuenta para el proyecto ${id_proyecto}`
      );

      return cantidadActualizada;
    } catch (error) {
      console.error("❌ Error al sincronizar resúmenes de cuenta:", error);
      throw error;
    }
  },

  /**
   * Crea una nueva cuota mensual (calculando todos sus valores) y
   * **actualiza el Proyecto asociado** con el `valor_mensual_final` resultante.
   * 🆕 También actualiza todos los ResumenCuenta existentes del proyecto.
   */
  async createAndSetProjectAmount(data) {
    const t = await sequelize.transaction();
    try {
      // 1. Obtener el Proyecto
      const proyecto = await Proyecto.findByPk(data.id_proyecto, {
        transaction: t,
      });

      if (!proyecto) {
        throw new Error("El proyecto especificado no fue encontrado.");
      }

      const totalCuotasProyecto = proyecto.plazo_inversion;

      if (!totalCuotasProyecto) {
        throw new Error(
          "El proyecto no tiene definido el número total de cuotas ('plazo_inversion')."
        );
      }

      // 2. Preparar datos y calcular valores
      const completeData = {
        ...data,
        total_cuotas_proyecto: totalCuotasProyecto,
      };

      const calculatedValues = this._calculateValues(completeData);

      // 3. Crear la nueva cuota
      const nuevaCuota = await CuotaMensual.create(
        {
          id_proyecto: completeData.id_proyecto,
          nombre_proyecto: completeData.nombre_proyecto,
          nombre_cemento_cemento: completeData.nombre_cemento_cemento,
          valor_cemento_unidades: completeData.valor_cemento_unidades,
          valor_cemento: completeData.valor_cemento,
          total_cuotas_proyecto: completeData.total_cuotas_proyecto,
          porcentaje_plan: completeData.porcentaje_plan,
          porcentaje_administrativo: completeData.porcentaje_administrativo,
          porcentaje_iva: completeData.porcentaje_iva,
          ...calculatedValues,
        },
        { transaction: t }
      );

      // 4. Actualizar el monto_inversion del proyecto
      await Proyecto.update(
        { monto_inversion: calculatedValues.valor_mensual_final },
        { where: { id: data.id_proyecto }, transaction: t }
      );

      // 🆕 5. Sincronizar todos los ResumenCuenta del proyecto
      const resumenesActualizados = await this._syncResumenesCuenta(
        data.id_proyecto,
        calculatedValues,
        completeData,
        t
      );

      await t.commit();

      // Retornar la cuota creada + info de sincronización
      return {
        cuota: nuevaCuota,
        resumenes_actualizados: resumenesActualizados,
      };
    } catch (primaryError) {
      try {
        if (t && t.finished !== "rollback") {
          await t.rollback();
        }
      } catch (rollbackError) {
        // Ignorar error de rollback
      }
      throw primaryError;
    }
  },

  /**
   * Actualiza una cuota por su ID, recalcula sus valores y actualiza el proyecto asociado.
   * 🆕 También sincroniza todos los ResumenCuenta del proyecto.
   */
  async update(id, data) {
    const t = await sequelize.transaction();
    try {
      const cuota = await CuotaMensual.findByPk(id, { transaction: t });
      if (!cuota) {
        await t.rollback();
        return null;
      }

      // 1. Determinar el total_cuotas_proyecto
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

      // 2. Combinar datos
      const mergedData = { ...cuota.dataValues, ...data };

      // 3. Recalcular valores
      const calculatedValues = this._calculateValues(mergedData);

      // 4. Actualizar la cuota
      await cuota.update(
        {
          ...mergedData,
          ...calculatedValues,
        },
        { transaction: t }
      );

      // 5. Actualizar el monto_inversion del proyecto
      await Proyecto.update(
        { monto_inversion: calculatedValues.valor_mensual_final },
        { where: { id: cuota.id_proyecto }, transaction: t }
      );

      // 🆕 6. Sincronizar todos los ResumenCuenta del proyecto
      const resumenesActualizados = await this._syncResumenesCuenta(
        cuota.id_proyecto,
        calculatedValues,
        mergedData,
        t
      );

      await t.commit();

      // Retornar la cuota actualizada + info de sincronización
      return {
        cuota: cuota,
        resumenes_actualizados: resumenesActualizados,
      };
    } catch (primaryError) {
      try {
        if (t && t.finished !== "rollback") {
          await t.rollback();
        }
      } catch (rollbackError) {
        // Ignorar error de rollback
      }
      throw primaryError;
    }
  },

  /**
   * Obtiene todas las cuotas de un proyecto específico.
   */
  async findByProjectId(id_proyecto) {
    return CuotaMensual.findAll({
      where: { id_proyecto: id_proyecto },
      order: [["createdAt", "DESC"]],
    });
  },

  /**
   * Obtiene la cuota más reciente creada para un proyecto.
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
   */
  async softDelete(id) {
    const cuota = await CuotaMensual.findByPk(id);
    if (!cuota) {
      return null;
    }
    await cuota.update({ activo: false });
    return cuota;
  },
};

module.exports = cuotaMensualService;
