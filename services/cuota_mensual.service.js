// services/cuotaMensualService.js
const CuotaMensual = require("../models/CuotaMensual");
const Proyecto = require("../models/proyecto");
const ResumenCuenta = require("../models/resumen_cuenta");
const SuscripcionProyecto = require("../models/suscripcion_proyecto");
const { sequelize } = require("../config/database");

const cuotaMensualService = {
  /**
   * Redondeo preciso a 2 decimales — usado SOLO para el valor final
   */
  _roundTo2(num) {
    return Math.round(num * 100) / 100;
  },

  /**
   * Cálculo de valores sin redondeo en pasos intermedios.
   *
   * Los porcentajes ingresan YA normalizados como decimales:
   * - porcentaje_plan: 0.70
   * - porcentaje_administrativo: 0.0015
   * - porcentaje_iva: 0.21
   *
   * La normalización ocurre en el controller (si vienen como enteros del frontend)
   * o se usan directamente (si vienen de la BD ya almacenados como decimales).
   *
   * REGLA: No redondear valores intermedios. Redondear SOLO valor_mensual_final.
   */
  _calculateValues(data) {
    // ✅ Sin división /100 — los porcentajes ya llegan normalizados
    const porcentaje_plan           = Number(data.porcentaje_plan);
    const porcentaje_administrativo = Number(data.porcentaje_administrativo);
    const porcentaje_iva            = Number(data.porcentaje_iva);
    const valor_cemento             = Number(data.valor_cemento);
    const valor_cemento_unidades    = Number(data.valor_cemento_unidades);
    const total_cuotas_proyecto     = Number(data.total_cuotas_proyecto);

    // 1. Valor Móvil — sin redondeo
    const valor_movil = valor_cemento * valor_cemento_unidades;

    // 2. Total del Plan — sin redondeo
    const total_del_plan = valor_movil * porcentaje_plan;

    // 3. Cuota Pura (plan / meses) — sin redondeo
    const valor_mensual = total_del_plan / total_cuotas_proyecto;

    // 4. Carga Administrativa — sin redondeo
    const carga_administrativa = valor_movil * porcentaje_administrativo;

    // 5. IVA sobre la carga administrativa — sin redondeo
    const iva_carga_administrativa = carga_administrativa * porcentaje_iva;

    // 6. Suma exacta de componentes antes de cualquier redondeo
    const valor_mensual_final_exacto =
      valor_mensual + carga_administrativa + iva_carga_administrativa;

    // 7. Redondeo ÚNICO al final
    const valor_mensual_final = this._roundTo2(valor_mensual_final_exacto);

    return {
      valor_movil,
      total_del_plan,
      valor_mensual,
      carga_administrativa,
      iva_carga_administrativa,
      valor_mensual_final,
    };
  },

  /**
   * Verificación de integridad para debugging
   */
  _verificarSuma(calculatedValues) {
    const suma_componentes =
      calculatedValues.valor_mensual +
      calculatedValues.carga_administrativa +
      calculatedValues.iva_carga_administrativa;

    // La diferencia debe ser <= 0.005 (medio centavo) ya que solo redondeamos al final
    const diferencia = Math.abs(
      suma_componentes - calculatedValues.valor_mensual_final
    );

    if (diferencia > 0.005) {
      console.warn(`⚠️ ADVERTENCIA: Diferencia de redondeo inesperada: ${diferencia.toFixed(8)}`);
      console.log("Componentes:", {
        plan:  calculatedValues.valor_mensual,
        admin: calculatedValues.carga_administrativa,
        iva:   calculatedValues.iva_carga_administrativa,
        suma_exacta: suma_componentes,
        final_redondeado: calculatedValues.valor_mensual_final,
        diferencia: diferencia.toFixed(8),
      });
    }

    return diferencia <= 0.005;
  },

  /**
   * Actualiza todos los ResumenCuenta asociados a un proyecto
   */
  async _syncResumenesCuenta(id_proyecto, calculatedValues, cuotaData, transaction) {
    try {
      const suscripciones = await SuscripcionProyecto.findAll({
        where: { id_proyecto, activo: true },
        attributes: ["id"],
        transaction,
      });

      if (suscripciones.length === 0) {
        console.log(`⚠️ No hay suscripciones activas para el proyecto ${id_proyecto}`);
        return 0;
      }

      const idsSuscripciones = suscripciones.map((s) => s.id);

      const nuevoDetalleCuota = {
        nombre_cemento:          cuotaData.nombre_cemento_cemento,
        valor_cemento_unidades:  cuotaData.valor_cemento_unidades,
        valor_cemento:           Number(cuotaData.valor_cemento),
        porcentaje_plan:         Number(cuotaData.porcentaje_plan),
        valor_movil:             calculatedValues.valor_movil,
        valor_mensual:           calculatedValues.valor_mensual,
        carga_administrativa:    calculatedValues.carga_administrativa,
        iva_carga_administrativa: calculatedValues.iva_carga_administrativa,
        valor_mensual_final:     calculatedValues.valor_mensual_final,
      };

      const [cantidadActualizada] = await ResumenCuenta.update(
        {
          detalle_cuota: nuevoDetalleCuota,
          meses_proyecto: cuotaData.total_cuotas_proyecto,
        },
        {
          where: { id_suscripcion: idsSuscripciones },
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
   * Crea una nueva cuota mensual y actualiza el proyecto
   */
  async createAndSetProjectAmount(data) {
    const t = await sequelize.transaction();
    try {
      const proyecto = await Proyecto.findByPk(data.id_proyecto, { transaction: t });

      if (!proyecto) {
        throw new Error("El proyecto especificado no fue encontrado.");
      }

      const totalCuotasProyecto = proyecto.plazo_inversion;

      if (!totalCuotasProyecto) {
        throw new Error(
          "El proyecto no tiene definido el número total de cuotas ('plazo_inversion')."
        );
      }

      const completeData = { ...data, total_cuotas_proyecto: totalCuotasProyecto };

      const calculatedValues = this._calculateValues(completeData);
      this._verificarSuma(calculatedValues);

      const nuevaCuota = await CuotaMensual.create(
        {
          id_proyecto:              completeData.id_proyecto,
          nombre_proyecto:          completeData.nombre_proyecto,
          nombre_cemento_cemento:   completeData.nombre_cemento_cemento,
          valor_cemento_unidades:   completeData.valor_cemento_unidades,
          valor_cemento:            completeData.valor_cemento,
          total_cuotas_proyecto:    completeData.total_cuotas_proyecto,
          porcentaje_plan:          completeData.porcentaje_plan,
          porcentaje_administrativo: completeData.porcentaje_administrativo,
          porcentaje_iva:           completeData.porcentaje_iva,
          ...calculatedValues,
        },
        { transaction: t }
      );

      await Proyecto.update(
        { monto_inversion: calculatedValues.valor_mensual_final },
        { where: { id: data.id_proyecto }, transaction: t }
      );

      const resumenesActualizados = await this._syncResumenesCuenta(
        data.id_proyecto,
        calculatedValues,
        completeData,
        t
      );

      await t.commit();

      return { cuota: nuevaCuota, resumenes_actualizados: resumenesActualizados };
    } catch (primaryError) {
      try {
        if (t && t.finished !== "rollback") await t.rollback();
      } catch (_) {}
      throw primaryError;
    }
  },

  /**
   * Actualiza una cuota existente
   */
  async update(id, data) {
    const t = await sequelize.transaction();
    try {
      const cuota = await CuotaMensual.findByPk(id, { transaction: t });
      if (!cuota) {
        await t.rollback();
        return null;
      }

      if (!data.total_cuotas_proyecto) {
        const proyecto = await Proyecto.findByPk(cuota.id_proyecto, { transaction: t });
        data.total_cuotas_proyecto =
          proyecto?.plazo_inversion ?? cuota.total_cuotas_proyecto;
      }

      const mergedData = { ...cuota.dataValues, ...data };

      const calculatedValues = this._calculateValues(mergedData);
      this._verificarSuma(calculatedValues);

      await cuota.update({ ...mergedData, ...calculatedValues }, { transaction: t });

      await Proyecto.update(
        { monto_inversion: calculatedValues.valor_mensual_final },
        { where: { id: cuota.id_proyecto }, transaction: t }
      );

      const resumenesActualizados = await this._syncResumenesCuenta(
        cuota.id_proyecto,
        calculatedValues,
        mergedData,
        t
      );

      await t.commit();

      return { cuota, resumenes_actualizados: resumenesActualizados };
    } catch (primaryError) {
      try {
        if (t && t.finished !== "rollback") await t.rollback();
      } catch (_) {}
      throw primaryError;
    }
  },

  /**
   * Obtiene todas las cuotas de un proyecto
   */
  async findByProjectId(id_proyecto) {
    return CuotaMensual.findAll({
      where: { id_proyecto },
      order: [["createdAt", "DESC"]],
    });
  },

  /**
   * Obtiene la cuota más reciente de un proyecto
   */
  async findLastByProjectId(id_proyecto) {
    return CuotaMensual.findOne({
      where: { id_proyecto },
      order: [["createdAt", "DESC"]],
      limit: 1,
    });
  },

  /**
   * Elimina lógicamente una cuota
   */
  async softDelete(id) {
    const cuota = await CuotaMensual.findByPk(id);
    if (!cuota) return null;
    await cuota.update({ activo: false });
    return cuota;
  },
};

module.exports = cuotaMensualService;