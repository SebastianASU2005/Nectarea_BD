const SuscripcionProyecto = require("../models/suscripcion_proyecto");
const Proyecto = require("../models/proyecto");
const CuotaMensual = require("../models/CuotaMensual");
const ResumenCuenta = require("../models/resumen_cuenta");
const moment = require("moment");
const Pago = require("../models/pago");
const { Op } = require("sequelize");

const resumenCuentaService = {
  /**
   * Crea y guarda un resumen de cuenta inicial cuando un usuario se suscribe a un proyecto.
   * @param {object} suscripcion - La instancia de SuscripcionProyecto.
   * @param {object} proyecto - La instancia del Proyecto.
   * @param {object} [options={}] - Opciones de Sequelize (ej. { transaction: t }).
   * @returns {Promise<object>} La instancia de ResumenCuenta creada.
   */
  async createAccountSummary(suscripcion, proyecto, options = {}) {
    try {
      // Incluir options para asegurar atomicidad en la búsqueda de la cuota mensual
      const cuotaMensual = await CuotaMensual.findOne({
        where: { id_proyecto: proyecto.id },
        order: [["createdAt", "DESC"]],
        limit: 1,
        ...options,
      });

      if (!cuotaMensual) {
        throw new Error("No se encontró una cuota mensual para el proyecto.");
      }

      const detalleCuota = {
        // Asegúrate de que los nombres de campo aquí coincidan con el modelo CuotaMensual
        nombre_cemento: cuotaMensual.nombre_cemento_cemento,
        valor_cemento_unidades: cuotaMensual.valor_cemento_unidades,
        valor_cemento: parseFloat(cuotaMensual.valor_cemento),
        porcentaje_plan: parseFloat(cuotaMensual.porcentaje_plan),
        valor_movil: parseFloat(cuotaMensual.valor_movil),
        valor_mensual: parseFloat(cuotaMensual.valor_mensual),
        carga_administrativa: parseFloat(cuotaMensual.carga_administrativa),
        iva_carga_administrativa: parseFloat(
          cuotaMensual.iva_carga_administrativa
        ),
        valor_mensual_final: parseFloat(cuotaMensual.valor_mensual_final),
      };

      const resumen = await ResumenCuenta.create(
        {
          id_suscripcion: suscripcion.id,
          nombre_proyecto: proyecto.nombre_proyecto,
          meses_proyecto: cuotaMensual.total_cuotas_proyecto,
          cuotas_pagadas: 0,
          cuotas_vencidas: 0,
          porcentaje_pagado: 0.0,
          detalle_cuota: detalleCuota,
        },
        options // Pasando la transacción a la creación del ResumenCuenta
      );

      return resumen;
    } catch (error) {
      console.error("Error al crear el resumen de cuenta:", error);
      throw error;
    }
  },
  /**
   * Obtiene todos los resúmenes de cuenta de un usuario a partir de las suscripciones.
   * @param {number} userId - ID del usuario.
   * @returns {Promise<object[]>} Un arreglo con los resúmenes de cuenta guardados.
   */
  async getAccountSummariesByUserId(userId) {
    try {
      const suscripciones = await SuscripcionProyecto.findAll({
        where: { id_usuario: userId },
        include: [
          {
            model: ResumenCuenta,
            as: "resumen_cuenta",
          },
          {
            model: Proyecto,
            as: "proyectoAsociado",
          },
        ],
      });

      const resumenes = suscripciones
        .filter((susc) => susc.resumen_cuenta)
        .map((susc) => ({
          ...susc.resumen_cuenta.get({ plain: true }),
          proyecto_info: {
            nombre_proyecto: susc.proyectoAsociado.nombre_proyecto,
            descripcion: susc.proyectoAsociado.descripcion,
          },
        }));

      return resumenes;
    } catch (error) {
      console.error("Error al obtener los resúmenes de cuenta:", error);
      throw error;
    }
  },
  /**
   * Actualiza el resumen de cuenta cuando se realiza un pago (incrementa cuotas pagadas, etc.).
   * Se invoca después de que un pago mensual o inicial se ha marcado como pagado.
   * @param {number} suscripcionId - ID de la suscripción.
   * @param {object} [options={}] - Opciones de Sequelize (ej. { transaction: t }).
   */
  async updateAccountSummaryOnPayment(suscripcionId, options = {}) {
    try {
      // Incluimos options para que la consulta sea atómica
      const suscripcion = await SuscripcionProyecto.findByPk(suscripcionId, {
        include: [
          // Filtrar solo los pagos completados para el conteo
          {
            model: Pago,
            as: "pagos",
            where: { estado_pago: { [Op.in]: ["pagado", "cubierto_por_puja"] } },
            required: false,
          },
          { model: ResumenCuenta, as: "resumen_cuenta" },
        ],
        ...options,
      });

      if (!suscripcion || !suscripcion.resumen_cuenta) {
        console.warn(
          `No se encontró suscripción o resumen para ID: ${suscripcionId}`
        );
        return;
      }
      // Calcular el número de pagos exitosos.
      const cuotasPagadas = suscripcion.pagos.length;
      const totalCuotasProyecto = suscripcion.resumen_cuenta.meses_proyecto;
      const porcentajePagado = (cuotasPagadas / totalCuotasProyecto) * 100;

      // Calcular cuotas vencidas (lógica de tiempo)
      const mesesTranscurridos = moment().diff(
        moment(suscripcion.createdAt),
        "months"
      );
      const cuotasVencidas = Math.max(0, mesesTranscurridos - cuotasPagadas);

      // Actualizamos el resumen, pasando options para la atomicidad
      await suscripcion.resumen_cuenta.update(
        {
          cuotas_pagadas: cuotasPagadas,
          porcentaje_pagado: parseFloat(porcentajePagado.toFixed(2)),
          cuotas_vencidas: cuotasVencidas,
        },
        options
      );

      console.log(
        `Resumen de cuenta actualizado para suscripción ID: ${suscripcionId}`
      );
    } catch (error) {
      console.error("Error al actualizar el resumen de cuenta:", error);
      throw error;
    }
  },
  /**
   * NUEVA FUNCIÓN: Actualiza el saldo general del usuario (aplicable a inversiones directas y pujas).
   * Esta función reemplaza la llamada incorrecta a 'actualizarSaldo' en transaccionService.
   * @param {number} userId - ID del usuario.
   * @param {number} monto - Monto a aplicar.
   * @param {object} t - Objeto de transacción de Sequelize.
   */
  async actualizarSaldoGeneral(userId, monto, t) {
    // Aquí se implementaría la lógica para actualizar el saldo total del usuario
    // en su tabla correspondiente (ej. Usuario.saldo o CuentaGeneral.saldo).
    console.log(
      `[SALDO_GENERAL] Usuario ${userId}: Movimiento de saldo general simulado por monto: ${monto}`
    );
    return {
      success: true,
      message: "Actualización de saldo general simulada, asumiendo que un modelo de Cuenta de Usuario se actualiza aquí.",
    };
  },
  
  /**
   * NOTA: El alias 'actualizarSaldo' ha sido removido para evitar la confusión de parámetros
   * que causó el error "Cannot create property 'attributes' on number".
   */

  /**
   * Obtiene un resumen de cuenta por su ID. (Necesario para el control de acceso en el controlador)
   * @param {number} id - ID del resumen.
   * @returns {Promise<ResumenCuenta>} El resumen con sus asociaciones.
   */
  async getById(id) {
    return ResumenCuenta.findByPk(id, {
      include: [
        {
          model: SuscripcionProyecto,
          as: "suscripcion",
          attributes: ["id", "id_usuario"],
        },
      ],
    });
  },
  /**
   * Actualiza los campos de un resumen de cuenta por su ID. (Función de Administrador)
   * @param {number} id - ID del resumen a actualizar.
   * @param {object} data - Datos a actualizar.
   * @returns {Promise<[number, ResumenCuenta[]]>} Resultado de la actualización.
   */
  async update(id, data) {
    return ResumenCuenta.update(data, {
      where: { id: id },
      returning: true,
    });
  },
  /**
   * Realiza una eliminación lógica de un resumen de cuenta. (Función de Administrador)
   * @param {number} id - ID del resumen a "eliminar".
   * @returns {Promise<number>} Número de filas afectadas (0 o 1).
   */
  async softDelete(id) {
    return ResumenCuenta.update({ activo: false }, { where: { id: id } });
  },
};

module.exports = resumenCuentaService;
