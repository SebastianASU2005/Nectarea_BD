// Archivo: services/resumen_cuenta.service.js

const SuscripcionProyecto = require("../models/suscripcion_proyecto");
const Proyecto = require("../models/proyecto");
const CuotaMensual = require("../models/CuotaMensual");
const ResumenCuenta = require("../models/resumen_cuenta");
const moment = require("moment"); // Librería para manejo de fechas
const Pago = require("../models/pago");
const { Op } = require("sequelize"); // Operadores de Sequelize

/**
 * Servicio de lógica de negocio para la gestión de Resúmenes de Cuenta de las Suscripciones.
 */
const resumenCuentaService = {
  /**
   * @async
   * @function createAccountSummary
   * @description Crea y guarda un resumen de cuenta inicial cuando un usuario se suscribe a un proyecto,
   * capturando la configuración de la última CuotaMensual vigente.
   * @param {object} suscripcion - La instancia de SuscripcionProyecto.
   * @param {object} proyecto - La instancia del Proyecto.
   * @param {object} [options={}] - Opciones de Sequelize (ej. { transaction: t }).
   * @returns {Promise<ResumenCuenta>} La instancia de ResumenCuenta creada.
   * @throws {Error} Si no se encuentra una cuota mensual para el proyecto.
   */
  async createAccountSummary(suscripcion, proyecto, options = {}) {
    try {
      // Busca la Cuota Mensual más reciente para capturar su detalle.
      const cuotaMensual = await CuotaMensual.findOne({
        where: { id_proyecto: proyecto.id },
        order: [["createdAt", "DESC"]], // Obtiene la última
        limit: 1,
        ...options, // Incluir options para asegurar atomicidad
      });

      if (!cuotaMensual) {
        throw new Error("No se encontró una cuota mensual para el proyecto.");
      }

      // Estructura los detalles de la cuota para almacenarlos como JSON en el resumen.
      const detalleCuota = {
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

      // Crea el registro inicial del resumen de cuenta con contadores en cero.
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
        options // Pasando la transacción a la creación
      );

      return resumen;
    } catch (error) {
      console.error("Error al crear el resumen de cuenta:", error);
      throw error;
    }
  },

  /**
   * @async
   * @function findAll
   * @description Obtiene todos los resúmenes de cuenta, incluyendo la suscripción asociada. (Función de Administrador).
   * @returns {Promise<ResumenCuenta[]>} Un arreglo con todos los resúmenes de cuenta.
   */
  async findAll() {
    return ResumenCuenta.findAll({
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
   * @async
   * @function getAccountSummariesByUserId
   * @description Obtiene todos los resúmenes de cuenta que pertenecen a un usuario específico.
   * @param {number} userId - ID del usuario.
   * @returns {Promise<object[]>} Un arreglo con los resúmenes de cuenta y la info del proyecto.
   */
  async getAccountSummariesByUserId(userId) {
    try {
      // Obtiene todas las suscripciones del usuario, incluyendo el resumen y el proyecto asociado.
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

      // Filtra las suscripciones que tienen resumen de cuenta y mapea el resultado al formato deseado.
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
   * @async
   * @function updateAccountSummaryOnPayment
   * @description Recalcula y actualiza el estado de un resumen de cuenta (cuotas pagadas, vencidas y porcentaje)
   * basándose en todos los pagos completados de la suscripción y el saldo a favor.
   * @param {number} suscripcionId - ID de la suscripción.
   * @param {object} [options={}] - Opciones de Sequelize (ej. { transaction: t }).
   */
  async updateAccountSummaryOnPayment(suscripcionId, options = {}) {
    try {
      // 1. Busca la suscripción y su resumen, incluyendo los pagos completados y la información del proyecto.
      const suscripcion = await SuscripcionProyecto.findByPk(suscripcionId, {
        include: [
          {
            model: Pago,
            as: "pagos",
            // Filtra solo los pagos exitosos.
            where: {
              estado_pago: { [Op.in]: ["pagado", "cubierto_por_puja"] },
            },
            required: false,
          },
          { model: ResumenCuenta, as: "resumen_cuenta" },
          {
            model: Proyecto,
            as: "proyectoAsociado",
            attributes: ["id", "monto_inversion"], // Necesitamos el monto para la cuota
          },
        ],
        ...options,
      });

      if (
        !suscripcion ||
        !suscripcion.resumen_cuenta ||
        !suscripcion.proyectoAsociado
      ) {
        console.warn(
          `No se encontró suscripción, resumen o proyecto para ID: ${suscripcionId}`
        );
        return;
      }

      const resumen = suscripcion.resumen_cuenta;
      const cuotaMensualBase = parseFloat(
        suscripcion.proyectoAsociado.monto_inversion
      );
      const saldoAFavor = parseFloat(suscripcion.saldo_a_favor || 0);

      // ===================================================================
      // 1. CÁLCULO DE CUOTAS PAGADAS REALES (PAGOS + SALDO)
      // ===================================================================

      // Pagos directos o cubiertos por puja
      const pagosEfectivos = suscripcion.pagos.length;

      // Cuotas adicionales cubiertas por el saldo a favor
     const cuotasPagadasTotal = pagosEfectivos;

      const totalCuotasProyecto = resumen.meses_proyecto;
      const porcentajePagado = (cuotasPagadasTotal / totalCuotasProyecto) * 100;

      // ===================================================================
      // 2. CÁLCULO DE CUOTAS VENCIDAS (DEUDA) 🚀 MODIFICACIÓN CLAVE
      // ===================================================================

      // 🚨 CAMBIO DE LÓGICA: Contamos cuántos pagos están EXPLÍCITAMENTE marcados como 'vencido'.
      const cuotasVencidas = await Pago.count({
        where: {
          id_suscripcion: suscripcionId,
          estado_pago: "vencido", // Cuenta todos los pagos en estado 'vencido'
        },
        ...options,
      });

      // ===================================================================
      // 3. ACTUALIZACIÓN FINAL
      // ===================================================================

      // Actualiza el resumen en la base de datos (pasando options para la atomicidad).
      await resumen.update(
        {
          cuotas_pagadas: cuotasPagadasTotal, // 👈 Se usa el total (Pagos + Saldo)
          porcentaje_pagado: parseFloat(porcentajePagado.toFixed(2)),
          cuotas_vencidas: cuotasVencidas, // 👈 USAMOS EL CONTEO EXPLÍCITO DE VENCIDOS
        },
        options
      );

      console.log(
        `Resumen de cuenta actualizado para suscripción ID: ${suscripcionId}. Pagadas (Efectivo+Saldo): ${cuotasPagadasTotal}. Vencidas: ${cuotasVencidas}.`
      );
    } catch (error) {
      console.error("Error al actualizar el resumen de cuenta:", error);
      throw error;
    }
  },

  /**
   * @async
   * @function actualizarSaldoGeneral
   * @description Función de simulación para actualizar el saldo general de un usuario
   * (usada por otros servicios como Transacciones o Pujas).
   * @param {number} userId - ID del usuario.
   * @param {number} monto - Monto a aplicar al saldo (positivo o negativo).
   * @param {object} t - Objeto de transacción de Sequelize.
   * @returns {Promise<object>} Un objeto con el resultado de la simulación.
   */
  async actualizarSaldoGeneral(userId, monto, t) {
    console.log(
      `[SALDO_GENERAL] Usuario ${userId}: Movimiento de saldo general simulado por monto: ${monto}`
    );
    // Nota: La implementación real requeriría un modelo de 'Cuenta de Usuario' o similar.
    return {
      success: true,
      message:
        "Actualización de saldo general simulada, asumiendo que un modelo de Cuenta de Usuario se actualiza aquí.",
    };
  },

  /**
   * @async
   * @function getById
   * @description Obtiene un resumen de cuenta por su ID, incluyendo la suscripción asociada. (Función de Administrador).
   * @param {number} id - ID del resumen.
   * @returns {Promise<ResumenCuenta|null>} El resumen con sus asociaciones.
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
  // 🆕 FUNCIÓN PARA REGISTRAR LA CANCELACIÓN EN EL RESUMEN/AUDITORÍA
  /**
   * @async
   * @function registrarEventoCancelacion
   * @description Registra un evento de cancelación en el resumen de cuenta (o sistema de auditoría),
   * indicando el monto prepagado que queda pendiente de liquidación.
   * @param {object} eventoData - Datos del evento (id_usuario, descripcion, monto, referencia_id, etc.).
   * @param {object} t - Objeto de transacción de Sequelize.
   * @returns {Promise<object>} Un objeto con el resultado de la simulación/registro.
   */
  async registrarEventoCancelacion(eventoData, t) {
    // En un sistema real, aquí se crearía un registro en una tabla de 'Movimientos/Eventos'
    // asociada al resumen de cuenta o al usuario, marcando el estado 'pendiente_de_devolucion'.
    console.log(
      `[RESUMEN_EVENTO] Usuario ${eventoData.id_usuario} - Evento registrado: ${
        eventoData.descripcion
      } (Monto prepagado: $${eventoData.monto.toFixed(2)})`
    );
    // Nota: Si quieres guardar esto en la BD, deberías tener un modelo 'EventoResumen' o similar.
    // Aquí solo simulamos el registro.
    return {
      success: true,
      message:
        "Evento de cancelación de suscripción registrado para auditoría y futura liquidación.",
    };
  },

  /**
   * @async
   * @function findResumenByIdAndUserId
   * @description Obtiene un resumen de cuenta, aplicando un filtro de seguridad para asegurar que pertenece al usuario dado.
   * @param {number} id - ID del resumen.
   * @param {number} userId - ID del usuario.
   * @returns {Promise<ResumenCuenta | null>} El resumen o null si no existe o no pertenece al usuario.
   */
  async findResumenByIdAndUserId(id, userId) {
    return ResumenCuenta.findOne({
      where: { id: id },
      include: [
        {
          model: SuscripcionProyecto,
          as: "suscripcion",
          where: { id_usuario: userId }, // FILTRO DE SEGURIDAD
          attributes: ["id", "id_usuario"],
          required: true, // Requiere que la suscripción coincida con el usuario.
        },
      ],
    });
  },

  /**
   * @async
   * @function update
   * @description Actualiza los campos de un resumen de cuenta por su ID. (Función de Administrador).
   * @param {number} id - ID del resumen a actualizar.
   * @param {object} data - Datos a actualizar.
   * @returns {Promise<[number, ResumenCuenta[]]>} Resultado de la actualización (número de filas afectadas e instancias actualizadas).
   */
  async update(id, data) {
    return ResumenCuenta.update(data, {
      where: { id: id },
      returning: true, // Devuelve las instancias actualizadas.
    });
  },

  /**
   * @async
   * @function softDelete
   * @description Realiza una eliminación lógica (soft delete) de un resumen de cuenta. (Función de Administrador).
   * @param {number} id - ID del resumen a "eliminar".
   * @returns {Promise<number>} Número de filas afectadas (0 o 1).
   */
  async softDelete(id) {
    return ResumenCuenta.update({ activo: false }, { where: { id: id } });
  },
};

module.exports = resumenCuentaService;
