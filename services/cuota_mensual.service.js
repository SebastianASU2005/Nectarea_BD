// services/cuota_mensual.service.js
const CuotaMensual = require("../models/CuotaMensual");
const Proyecto = require("../models/proyecto");
const ResumenCuenta = require("../models/resumen_cuenta");
const SuscripcionProyecto = require("../models/suscripcion_proyecto");
const { sequelize } = require("../config/database");
const auditService = require("./audit.service");

const cuotaMensualService = {
  _roundTo2(num) {
    return Math.round(num * 100) / 100;
  },

  _calculateValues(data) {
    const porcentaje_plan = Number(data.porcentaje_plan);
    const porcentaje_administrativo = Number(data.porcentaje_administrativo);
    const porcentaje_iva = Number(data.porcentaje_iva);
    const valor_cemento = Number(data.valor_cemento);
    const valor_cemento_unidades = Number(data.valor_cemento_unidades);
    const total_cuotas_proyecto = Number(data.total_cuotas_proyecto);

    const valor_movil = valor_cemento * valor_cemento_unidades;
    const total_del_plan = valor_movil * porcentaje_plan;
    const valor_mensual = total_del_plan / total_cuotas_proyecto;
    const carga_administrativa = valor_movil * porcentaje_administrativo;
    const iva_carga_administrativa = carga_administrativa * porcentaje_iva;
    const valor_mensual_final_exacto =
      valor_mensual + carga_administrativa + iva_carga_administrativa;
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

  _verificarSuma(calculatedValues) {
    const suma_componentes =
      calculatedValues.valor_mensual +
      calculatedValues.carga_administrativa +
      calculatedValues.iva_carga_administrativa;
    const diferencia = Math.abs(
      suma_componentes - calculatedValues.valor_mensual_final,
    );
    if (diferencia > 0.005) {
      console.warn(
        `⚠️ ADVERTENCIA: Diferencia de redondeo inesperada: ${diferencia.toFixed(8)}`,
      );
    }
    return diferencia <= 0.005;
  },

  async _syncResumenesCuenta(
    id_proyecto,
    calculatedValues,
    cuotaData,
    transaction,
  ) {
    try {
      const suscripciones = await SuscripcionProyecto.findAll({
        where: { id_proyecto, activo: true },
        attributes: ["id"],
        transaction,
      });
      if (suscripciones.length === 0) return 0;

      const idsSuscripciones = suscripciones.map((s) => s.id);
      const nuevoDetalleCuota = {
        nombre_cemento: cuotaData.nombre_cemento_cemento,
        valor_cemento_unidades: cuotaData.valor_cemento_unidades,
        valor_cemento: Number(cuotaData.valor_cemento),
        porcentaje_plan: Number(cuotaData.porcentaje_plan),
        valor_movil: calculatedValues.valor_movil,
        valor_mensual: calculatedValues.valor_mensual,
        carga_administrativa: calculatedValues.carga_administrativa,
        iva_carga_administrativa: calculatedValues.iva_carga_administrativa,
        valor_mensual_final: calculatedValues.valor_mensual_final,
      };

      const [cantidadActualizada] = await ResumenCuenta.update(
        {
          detalle_cuota: nuevoDetalleCuota,
          meses_proyecto: cuotaData.total_cuotas_proyecto,
        },
        { where: { id_suscripcion: idsSuscripciones }, transaction },
      );
      return cantidadActualizada;
    } catch (error) {
      console.error("❌ Error al sincronizar resúmenes de cuenta:", error);
      throw error;
    }
  },

  /**
   * Crea una nueva cuota mensual con auditoría
   */
  async createAndSetProjectAmount(data, adminContext = {}) {
    const { adminId, ip, userAgent } = adminContext;
    const t = await sequelize.transaction();
    try {
      const proyecto = await Proyecto.findByPk(data.id_proyecto, {
        transaction: t,
      });
      if (!proyecto)
        throw new Error("El proyecto especificado no fue encontrado.");

      const totalCuotasProyecto = proyecto.plazo_inversion;
      if (!totalCuotasProyecto)
        throw new Error("El proyecto no tiene definido 'plazo_inversion'.");

      const completeData = {
        ...data,
        total_cuotas_proyecto: totalCuotasProyecto,
      };
      const calculatedValues = this._calculateValues(completeData);
      this._verificarSuma(calculatedValues);

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
        { transaction: t },
      );

      await Proyecto.update(
        { monto_inversion: calculatedValues.valor_mensual_final },
        { where: { id: data.id_proyecto }, transaction: t },
      );

      const resumenesActualizados = await this._syncResumenesCuenta(
        data.id_proyecto,
        calculatedValues,
        completeData,
        t,
      );

      // ✅ Auditoría
      if (adminId) {
        await auditService.registrar({
          usuarioId: adminId,
          accion: "CREAR_CUOTA_MENSUAL",
          entidadTipo: "CuotaMensual",
          entidadId: nuevaCuota.id,
          datosPrevios: null,
          datosNuevos: nuevaCuota.toJSON(),
          motivo: null,
          ip,
          userAgent,
          transaccion: t,
        });
      }

      await t.commit();
      return {
        cuota: nuevaCuota,
        resumenes_actualizados: resumenesActualizados,
      };
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },

  /**
   * Actualiza una cuota existente con auditoría
   */
  async update(id, data, adminContext = {}) {
    const { adminId, ip, userAgent } = adminContext;
    const t = await sequelize.transaction();
    try {
      const cuota = await CuotaMensual.findByPk(id, { transaction: t });
      if (!cuota) {
        await t.rollback();
        return null;
      }

      if (!data.total_cuotas_proyecto) {
        const proyecto = await Proyecto.findByPk(cuota.id_proyecto, {
          transaction: t,
        });
        data.total_cuotas_proyecto =
          proyecto?.plazo_inversion ?? cuota.total_cuotas_proyecto;
      }

      const mergedData = { ...cuota.dataValues, ...data };
      const calculatedValues = this._calculateValues(mergedData);
      this._verificarSuma(calculatedValues);

      const datosPrevios = cuota.toJSON();
      await cuota.update(
        { ...mergedData, ...calculatedValues },
        { transaction: t },
      );

      await Proyecto.update(
        { monto_inversion: calculatedValues.valor_mensual_final },
        { where: { id: cuota.id_proyecto }, transaction: t },
      );

      const resumenesActualizados = await this._syncResumenesCuenta(
        cuota.id_proyecto,
        calculatedValues,
        mergedData,
        t,
      );

      // ✅ Auditoría
      if (adminId) {
        await auditService.registrar({
          usuarioId: adminId,
          accion: "ACTUALIZAR_CUOTA_MENSUAL",
          entidadTipo: "CuotaMensual",
          entidadId: cuota.id,
          datosPrevios,
          datosNuevos: cuota.toJSON(),
          motivo: null,
          ip,
          userAgent,
          transaccion: t,
        });
      }

      await t.commit();
      return { cuota, resumenes_actualizados: resumenesActualizados };
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },

  async findByProjectId(id_proyecto) {
    return CuotaMensual.findAll({
      where: { id_proyecto },
      order: [["createdAt", "DESC"]],
    });
  },

  async findLastByProjectId(id_proyecto) {
    return CuotaMensual.findOne({
      where: { id_proyecto },
      order: [["createdAt", "DESC"]],
      limit: 1,
    });
  },

  /**
   * Soft delete con auditoría
   */
  async softDelete(id, adminContext = {}) {
    const { adminId, ip, userAgent } = adminContext;
    const t = await sequelize.transaction();
    try {
      const cuota = await CuotaMensual.findByPk(id, { transaction: t });
      if (!cuota) {
        await t.rollback();
        return null;
      }

      const datosPrevios = cuota.toJSON();
      await cuota.update({ activo: false }, { transaction: t });

      if (adminId) {
        await auditService.registrar({
          usuarioId: adminId,
          accion: "ELIMINAR_CUOTA_MENSUAL",
          entidadTipo: "CuotaMensual",
          entidadId: cuota.id,
          datosPrevios,
          datosNuevos: { activo: false },
          motivo: null,
          ip,
          userAgent,
          transaccion: t,
        });
      }

      await t.commit();
      return cuota;
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },
};

module.exports = cuotaMensualService;
