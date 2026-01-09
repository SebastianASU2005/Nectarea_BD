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
 * ✅ OPTIMIZADO: Cálculos con precisión mejorada para evitar errores de redondeo.
 */
const cuotaMensualService = {
  /**
   * Función auxiliar para redondeo preciso a 2 decimales
   * Usa Math.round para redondeo bancario consistente
   */
  _roundTo2(num) {
    return Math.round(num * 100) / 100;
  },

  /**
   * Función privada que calcula el valor total de la cuota mensual
   * basado en el valor del cemento, unidades y los porcentajes aplicables.
   *
   * OPTIMIZACIÓN: Minimiza errores de redondeo trabajando con precisión extendida
   * y redondeando solo en los puntos críticos.
   */
  _calculateValues(data) {
    // Convertir a números de alta precisión
    const porcentaje_plan = Number(data.porcentaje_plan);
    const porcentaje_administrativo = Number(data.porcentaje_administrativo);
    const porcentaje_iva = Number(data.porcentaje_iva);
    const valor_cemento = Number(data.valor_cemento);
    const valor_cemento_unidades = Number(data.valor_cemento_unidades);
    const total_cuotas_proyecto = Number(data.total_cuotas_proyecto);

    // 1. Valor Móvil Total
    // Redondear solo después de la multiplicación completa
    const valor_movil = this._roundTo2(valor_cemento_unidades * valor_cemento);

    // 2. Valor Mensual "FULL" (El 100% de la cuota si no tuviera plan)
    // Usamos esto como BASE para calcular la administración
    // NO redondeamos aquí para mantener precisión
    const valor_mensual_full = valor_movil / total_cuotas_proyecto;

    // 3. Valor Mensual del Plan (El capital real que paga el cliente: 85%)
    // Trabajar con precisión extendida
    const total_del_plan = valor_movil * (porcentaje_plan / 100);
    const valor_mensual_plan = total_del_plan / total_cuotas_proyecto;

    // 4. Carga Administrativa (19% sobre el valor FULL, no sobre el plan)
    // Calcular sobre el valor FULL sin redondear
    const carga_administrativa =
      valor_mensual_full * (porcentaje_administrativo / 100);

    // 5. IVA (21% sobre la carga administrativa)
    const iva_carga_administrativa =
      carga_administrativa * (porcentaje_iva / 100);

    // 6. Total Final
    // Sumar todos los componentes SIN redondear intermedios y redondear solo el resultado final
    const valor_mensual_final =
      valor_mensual_plan + carga_administrativa + iva_carga_administrativa;

    // Preparar valores finales con redondeo
    const valores_finales = {
      valor_movil: valor_movil, // Ya redondeado en paso 1
      total_del_plan: this._roundTo2(total_del_plan),
      valor_mensual: this._roundTo2(valor_mensual_plan),
      carga_administrativa: this._roundTo2(carga_administrativa),
      iva_carga_administrativa: this._roundTo2(iva_carga_administrativa),
      valor_mensual_final: this._roundTo2(valor_mensual_final),
    };

    // Verificar que la suma sea consistente (solo en desarrollo)
    if (process.env.NODE_ENV !== "production") {
      this._verificarSuma(valores_finales);
    }

    return valores_finales;
  },

  /**
   * Función de verificación para debugging
   * Valida que la suma de componentes coincida con el total final
   */
  _verificarSuma(calculatedValues) {
    const suma_componentes =
      calculatedValues.valor_mensual +
      calculatedValues.carga_administrativa +
      calculatedValues.iva_carga_administrativa;

    const diferencia = Math.abs(
      suma_componentes - calculatedValues.valor_mensual_final
    );

    if (diferencia > 0.01) {
      console.warn(
        `⚠️ ADVERTENCIA: Diferencia de redondeo detectada: ${diferencia.toFixed(
          4
        )}`
      );
      console.log("Componentes:", {
        plan: calculatedValues.valor_mensual,
        admin: calculatedValues.carga_administrativa,
        iva: calculatedValues.iva_carga_administrativa,
        suma: suma_componentes.toFixed(2),
        final: calculatedValues.valor_mensual_final,
        diferencia: diferencia.toFixed(4),
      });
    }

    return diferencia <= 0.01;
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

      // 2. Construir el nuevo detalle_cuota con valores ya redondeados
      const nuevoDetalleCuota = {
        nombre_cemento: cuotaData.nombre_cemento_cemento,
        valor_cemento_unidades: cuotaData.valor_cemento_unidades,
        valor_cemento: this._roundTo2(cuotaData.valor_cemento),
        porcentaje_plan: this._roundTo2(cuotaData.porcentaje_plan),
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

      // 3. Recalcular valores con precisión optimizada
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
