// Archivo: services/pago.service.js

const { Op } = require("sequelize");
const Pago = require("../models/Pago");
const SuscripcionProyecto = require("../models/suscripcion_proyecto");
const Usuario = require("../models/usuario");
const Proyecto = require("../models/proyecto");
const emailService = require("./email.service");
const mensajeService = require("./mensaje.service");
const { sequelize } = require("../config/database");
const resumenCuentaService = require("./resumen_cuenta.service"); // 🚀 IMPORTACIÓN CLAVE

/**
 * @typedef {object} PagoData
 * @property {number} id_suscripcion - ID de la suscripción asociada.
 * @property {number} id_usuario - ID del usuario de la suscripción.
 * @property {number} id_proyecto - ID del proyecto asociado.
 * @property {number} monto - Monto a pagar.
 * @property {Date} fecha_vencimiento - Fecha límite para el pago.
 * @property {string} estado_pago - Estado del pago ('pendiente', 'pagado', etc.).
 * @property {number} mes - Número de mes de la cuota.
 */

/**
 * Servicio de lógica de negocio para la gestión de Pagos de Suscripciones.
 */
const pagoService = {
  /**
   * @async
   * @function create
   * @description Crea un nuevo registro de Pago.
   * @param {PagoData} data - Datos del pago a crear.
   * @param {object} [options] - Opciones de Sequelize (ej. transaction).
   * @returns {Promise<Pago>} El pago creado.
   */
  async create(data, options = {}) {
    return Pago.create(data, options);
  }
  /**
   * @async
   * @function findAll
   * @description Obtiene todos los registros de Pagos.
   * @returns {Promise<Pago[]>} Lista de todos los pagos.
   */,

  async findAll() {
    return Pago.findAll();
  }
  /**
   * @async
   * @function findById
   * @description Obtiene un pago por su clave primaria.
   * @param {number} id - ID del pago.
   * @param {object} [options] - Opciones de Sequelize (ej. include).
   * @returns {Promise<Pago|null>} El pago encontrado.
   */,

  async findById(id, options = {}) {
    return Pago.findByPk(id, options);
  }
  /**
   * @async
   * @function findByUserId
   * @description Obtiene todos los pagos asociados a las suscripciones de un usuario.
   * @param {number} id_usuario - ID del usuario.
   * @returns {Promise<Pago[]>} Lista de pagos del usuario.
   */,

  async findByUserId(id_usuario) {
    return Pago.findAll({
      include: [
        {
          model: SuscripcionProyecto,
          as: "suscripcion",
          where: {
            id_usuario: id_usuario, // Filtra solo las suscripciones del usuario
          },
          required: true, // INNER JOIN
        },
      ],
    });
  }
  /**
   * @async
   * @function getValidPaymentDetails
   * @description Valida la existencia, la propiedad del usuario y el estado para poder procesar el pago.
   * @param {number} pagoId - El ID del pago a procesar.
   * @param {number} userId - El ID del usuario autenticado.
   * @returns {Promise<Pago>} El objeto Pago validado (con `suscripcion` adjunta en `dataValues`).
   * @throws {Error} Si el pago no existe, no es del usuario, está inactivo o ya fue pagado/cancelado.
   */,

  async getValidPaymentDetails(pagoId, userId) {
    try {
      // 1. Buscar el Pago base
      const pago = await Pago.findByPk(pagoId);

      if (!pago) {
        throw new Error(`Pago ID ${pagoId} no encontrado.`);
      } // 2. Validar propiedad y estado activo de la Suscripción asociada

      const suscripcion = await SuscripcionProyecto.findOne({
        where: {
          id: pago.id_suscripcion,
          activo: true,
          id_usuario: userId, // 🎯 Clave: Valida propiedad y activa
        },
        attributes: ["id_usuario", "id_proyecto"],
      });

      if (!suscripcion) {
        throw new Error(
          `Pago ID ${pagoId} encontrado, pero la suscripción asociada no está activa o no te pertenece.`
        );
      } // 3. Validar estado del pago

      const estadoActual = pago.estado_pago;
      const estadosFinales = ["pagado", "cancelado", "cubierto_por_puja"];
      const estadosPermitidos = ["pendiente", "vencido"];

      if (estadosFinales.includes(estadoActual)) {
        throw new Error(
          `El pago ID ${pagoId} ya se encuentra en estado: ${estadoActual}.`
        );
      }
      if (!estadosPermitidos.includes(estadoActual)) {
        throw new Error(
          `Estado de pago inválido (${estadoActual}). Solo se pueden pagar estados PENDIENTE o VENCIDO.`
        );
      } // Adjuntar Suscripción al Pago para uso posterior (ej. en markAsPaid)

      pago.dataValues.suscripcion = suscripcion;

      return pago;
    } catch (error) {
      throw new Error(`Error en la validación del pago: ${error.message}`);
    }
  }
  /**
   * @async
   * @function generarPagoMensualConDescuento
   * @description Genera un nuevo registro de pago mensual, aplicando el saldo a favor de la suscripción.
   * @param {number} suscripcionId - ID de la suscripción.
   * @param {object} [options] - Opciones de Sequelize (ej. transaction).
   * @returns {Promise<Pago|object>} El nuevo pago generado o un mensaje si no hay meses restantes.
   * @throws {Error} Si la suscripción o proyecto no existen o faltan IDs clave.
   */,

  async generarPagoMensualConDescuento(suscripcionId, options = {}) {
    const t = options.transaction || (await sequelize.transaction());
    try {
      // 1. Buscar Suscripción y Proyecto asociado
      const suscripcion = await SuscripcionProyecto.findByPk(suscripcionId, {
        transaction: t,
        include: [{ model: Proyecto, as: "proyectoAsociado" }],
      });

      if (
        !suscripcion ||
        !suscripcion.proyectoAsociado ||
        !suscripcion.id_usuario ||
        !suscripcion.id_proyecto
      ) {
        if (!options.transaction) await t.rollback();
        throw new Error("Suscripción, proyecto o IDs asociados faltantes.");
      } // 2. Verificar meses restantes

      if (suscripcion.meses_a_pagar <= 0) {
        if (!options.transaction) await t.commit();
        return { message: "No hay más meses por pagar en esta suscripción." };
      } // 3. Determinar el número de mes del pago

      const ultimoPago = await Pago.findOne({
        where: { id_suscripcion: suscripcionId },
        order: [["mes", "DESC"]],
        transaction: t,
      });
      const proximoMes = ultimoPago ? ultimoPago.mes + 1 : 1; // 4. Aplicar saldo a favor

      const cuotaMensual = parseFloat(
        suscripcion.proyectoAsociado.monto_inversion
      );
      let saldoAFavor = parseFloat(suscripcion.saldo_a_favor);
      let montoAPagar = cuotaMensual;
      let estado_pago = "pendiente";

      if (saldoAFavor > 0) {
        const descuentoAplicado = Math.min(cuotaMensual, saldoAFavor);
        montoAPagar = cuotaMensual - descuentoAplicado;
        saldoAFavor -= descuentoAplicado; // Actualizar saldo a favor en la suscripción

        await suscripcion.update(
          { saldo_a_favor: saldoAFavor.toFixed(2) },
          { transaction: t }
        );

        if (montoAPagar === 0) {
          estado_pago = "cubierto_por_puja"; // Estado especial si es cubierto 100% por saldo
        }
      } // 5. Calcular la fecha de vencimiento (Día 10 del mes en que se crea)

      const now = new Date();
      const fechaVencimiento = new Date(now.getFullYear(), now.getMonth(), 10);
      fechaVencimiento.setHours(0, 0, 0, 0); // 6. ✅ CRÍTICO: Crear el nuevo registro de Pago

      const nuevoPago = await Pago.create(
        {
          id_suscripcion: suscripcion.id,
          id_usuario: suscripcion.id_usuario, // Asignación explícita desde la suscripción
          id_proyecto: suscripcion.id_proyecto, // Asignación explícita desde la suscripción
          monto: montoAPagar.toFixed(2),
          fecha_vencimiento: fechaVencimiento,
          estado_pago: estado_pago,
          mes: proximoMes,
        },
        { transaction: t }
      ); // 7. Decrementar meses restantes a pagar

      await suscripcion.decrement("meses_a_pagar", { by: 1, transaction: t });

      if (!options.transaction) await t.commit();
      return nuevoPago;
    } catch (error) {
      if (t && !options.transaction) await t.rollback();
      throw error;
    }
  }
  /**
   * @async
   * @function handlePaymentFailure
   * @description Gestiona la lógica después de un intento fallido de pago. Cancela el pago solo si es el **Mes 1**;
   * en otros casos, lo deja en 'pendiente' o 'vencido' para reintento.
   * @param {number} pagoId - ID del pago afectado.
   * @param {object} t - Objeto de transacción de Sequelize.
   * @returns {Promise<Pago>} El pago actualizado.
   * @throws {Error} Si el pago no es encontrado.
   */,

  async handlePaymentFailure(pagoId, t) {
    const pago = await Pago.findByPk(pagoId, { transaction: t });

    if (!pago) {
      throw new Error("Pago no encontrado para manejar la falla.");
    } // Lógica de cancelación forzada para el primer mes

    if (pago.mes === 1 && pago.estado_pago === "pendiente") {
      await pago.update(
        { estado_pago: "cancelado", fecha_pago: null },
        { transaction: t }
      );
      console.log(
        `Pago ID ${pagoId} (Mes 1) cancelado debido a la falla de la transacción.`
      );
      return pago;
    } // Para Mes > 1, el estado se mantiene pendiente/vencido.

    console.log(
      `Pago ID ${pagoId} (Mes ${pago.mes}) mantiene su estado pendiente/vencido tras la falla de la transacción.`
    );
    return pago;
  }
  /**
   * @async
   * @function markAsPaid
   * @description Marca un pago como `pagado`, registra la fecha, actualiza el resumen de cuenta y envía notificaciones.
   * @param {number} pagoId - ID del pago a confirmar.
   * @param {object} t - Objeto de transacción de Sequelize.
   * @returns {Promise<Pago>} El pago confirmado.
   * @throws {Error} Si el pago, usuario o proyecto no son encontrados.
   */,

  async markAsPaid(pagoId, t) {
    try {
      const pago = await Pago.findByPk(pagoId, {
        transaction: t,
        include: [
          {
            model: SuscripcionProyecto,
            as: "suscripcion",
            include: [
              { model: Proyecto, as: "proyectoAsociado" },
              { model: Usuario, as: "usuario" },
            ],
          },
        ],
      });

      if (!pago) throw new Error("Pago no encontrado.");
      if (pago.estado_pago === "pagado") return pago;

      const usuario = pago.suscripcion?.usuario;
      const proyecto = pago.suscripcion?.proyectoAsociado;

      if (!usuario || !proyecto) {
        throw new Error(
          "No se pudo determinar el Usuario o Proyecto asociado al pago para enviar notificaciones."
        );
      } // 1. Actualizar el estado del Pago

      await pago.update(
        { estado_pago: "pagado", fecha_pago: new Date() },
        { transaction: t }
      ); // 2. 🚨 CRÍTICO: Actualizar el resumen de cuenta (disminuir cuotas vencidas, actualizar saldo)

      await resumenCuentaService.updateAccountSummaryOnPayment(
        pago.id_suscripcion,
        { transaction: t }
      ); // 3. Notificaciones

      await emailService.notificarPagoRecibido(
        usuario,
        proyecto,
        pago.monto,
        pago.mes
      );
      const contenido = `Tu pago de $${pago.monto} para la cuota #${pago.mes} del proyecto "${proyecto.nombre_proyecto}" ha sido procesado exitosamente.`;
      await mensajeService.crear(
        { id_remitente: 1, id_receptor: usuario.id, contenido: contenido },
        { transaction: t }
      );

      return pago;
    } catch (error) {
      throw error;
    }
  }
  /**
   * @async
   * @function markOverduePayments
   * @description Identifica y marca todos los pagos 'pendiente' cuya fecha de vencimiento ya pasó.
   * Actualiza el resumen de cuenta para reflejar la nueva cuota vencida.
   * @returns {Promise<number>} Número de pagos actualizados a 'vencido'.
   * @throws {Error} Si ocurre un error de base de datos.
   */,

  async markOverduePayments() {
    const t = await sequelize.transaction();
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0); // 1. Buscar todos los pagos PENDIENTES cuya fecha de vencimiento es ANTERIOR a hoy.

      const paymentsToUpdate = await Pago.findAll({
        where: {
          estado_pago: "pendiente",
          fecha_vencimiento: {
            [Op.lt]: today, // Vencidos antes de hoy
          },
        },
        transaction: t,
      });

      if (paymentsToUpdate.length === 0) {
        await t.commit();
        return 0;
      } // 2. Actualizar el estado y el resumen de cuenta para cada pago vencido.

      for (const pago of paymentsToUpdate) {
        // a) Actualizar el estado del Pago a 'vencido'
        await pago.update({ estado_pago: "vencido" }, { transaction: t }); // b) 🚨 Llamada al servicio: Registrar la cuota vencida en el resumen de cuenta
        await resumenCuentaService.updateAccountSummaryOnOverdue(
          pago.id_suscripcion,
          { transaction: t }
        ); // c) (Opcional) Notificación de pago vencido
      }

      await t.commit();
      return paymentsToUpdate.length;
    } catch (error) {
      await t.rollback();
      console.error("Error en markOverduePayments:", error.message);
      throw new Error(`Error al procesar pagos vencidos: ${error.message}`);
    }
  }
  /**
   * @async
   * @function deleteCanceledPayments
   * @description Elimina físicamente los registros de pagos que están en estado `cancelado`.
   * @returns {Promise<number>} Número de filas eliminadas.
   * @throws {Error} Si ocurre un error de base de datos.
   */,

  async deleteCanceledPayments() {
    try {
      const result = await Pago.destroy({
        where: { estado_pago: "cancelado" },
      });
      return result;
    } catch (error) {
      throw new Error(`Error al eliminar pagos cancelados: ${error.message}`);
    }
  }
  /**
   * @async
   * @function findPaymentsDueSoon
   * @description Busca pagos pendientes cuya fecha de vencimiento esté entre hoy y los próximos 3 días (para recordatorios).
   * @returns {Promise<Pago[]>} Lista de pagos a vencer pronto, incluyendo detalles de proyecto y usuario.
   */,

  async findPaymentsDueSoon() {
    const today = new Date();
    const threeDaysFromNow = new Date();
    threeDaysFromNow.setDate(today.getDate() + 3);

    today.setHours(0, 0, 0, 0);
    threeDaysFromNow.setHours(23, 59, 59, 999);

    return Pago.findAll({
      where: {
        estado_pago: "pendiente",
        fecha_vencimiento: {
          [Op.between]: [today, threeDaysFromNow],
        },
      },
      include: [
        {
          model: SuscripcionProyecto,
          as: "suscripcion",
          include: [
            { model: Proyecto, as: "proyectoAsociado" },
            { model: Usuario, as: "usuario" },
          ],
        },
      ],
    });
  }
  /**
   * @async
   * @function findOverduePayments
   * @description Busca pagos que ya fueron marcados como 'vencido'.
   * @returns {Promise<Pago[]>} Lista de pagos vencidos, incluyendo detalles de proyecto y usuario.
   */,

  async findOverduePayments() {
    return Pago.findAll({
      where: { estado_pago: "vencido" },
      include: [
        {
          model: SuscripcionProyecto,
          as: "suscripcion",
          include: [
            { model: Proyecto, as: "proyectoAsociado" },
            { model: Usuario, as: "usuario" },
          ],
        },
      ],
    });
  }
  /**
   * @async
   * @function updateLastNotificationDate
   * @description Actualiza la fecha de la última notificación de un pago.
   * @param {number} id_pago - ID del pago a actualizar.
   * @throws {Error} Si falla la actualización.
   */,

  async updateLastNotificationDate(id_pago) {
    try {
      await Pago.update(
        { fecha_ultima_notificacion: new Date() },
        { where: { id: id_pago } }
      );
    } catch (error) {
      throw error;
    }
  }
  /**
   * @async
   * @function getMonthlyPaymentMetrics
   * @description Calcula el total de pagos generados, pagados y vencidos en un mes/año específicos,
   * incluyendo la Tasa de Morosidad (KPI 1) y el Recaudo Mensual Neto (KPI 2).
   * @param {number} mes - El mes a consultar (1-12).
   * @param {number} anio - El año a consultar.
   * @returns {Promise<object>} Objeto con las métricas agregadas.
   */,

  async getMonthlyPaymentMetrics(mes, anio) {
    // 1. Definir el rango de fechas (fecha de creación del pago)
    const fechaInicio = new Date(anio, mes - 1, 1);
    const fechaFin = new Date(anio, mes, 0);
    fechaFin.setHours(23, 59, 59, 999); // 2. Usar Sequelize para la agregación condicional (SQL `CASE WHEN`)

    const resultados = await Pago.findAll({
      attributes: [
        // KPI 2: Recaudo total
        [
          sequelize.literal(
            `SUM(CASE WHEN estado_pago = 'pagado' THEN monto ELSE 0 END)`
          ),
          "total_recaudado",
        ], // Denominador y Total Pagados
        [sequelize.literal(`COUNT(*)`), "total_pagos_generados"], // Numerador Morosidad
        [
          sequelize.literal(
            `SUM(CASE WHEN estado_pago = 'vencido' THEN 1 ELSE 0 END)`
          ),
          "total_pagos_vencidos",
        ], // Conteo Pagados
        [
          sequelize.literal(
            `SUM(CASE WHEN estado_pago = 'pagado' THEN 1 ELSE 0 END)`
          ),
          "total_pagos_pagados",
        ],
      ],
      where: {
        createdAt: { [Op.between]: [fechaInicio, fechaFin] },
      },
      raw: true,
    }); // 3. Procesar resultados y calcular Tasa de Morosidad (KPI 1)

    const data = resultados[0] || {};
    const totalGenerado = parseInt(data.total_pagos_generados || 0);
    const totalVencidos = parseInt(data.total_pagos_vencidos || 0);
    const totalRecaudado = parseFloat(data.total_recaudado || 0);

    const tasaMorosidad =
      totalGenerado > 0 ? (totalVencidos / totalGenerado) * 100 : 0;

    return {
      mes: `${mes}/${anio}`,
      total_recaudado: totalRecaudado.toFixed(2), // KPI 2
      total_pagos_generados: totalGenerado,
      total_pagos_vencidos: totalVencidos,
      tasa_morosidad: tasaMorosidad.toFixed(2), // KPI 1
      total_pagos_pagados: parseInt(data.total_pagos_pagados || 0),
    };
  }
  /**
   * @async
   * @function getOnTimePaymentRate
   * @description Calcula el porcentaje de pagos que se efectuaron **antes o en su fecha de vencimiento** (KPI 3).
   * Se basa en la fecha de pago (`fecha_pago`).
   * @param {number} mes - Mes a consultar (1-12).
   * @param {number} anio - Año a consultar.
   * @returns {Promise<object>} Objeto con el porcentaje de pagos a tiempo.
   */,

  async getOnTimePaymentRate(mes, anio) {
    const fechaInicio = new Date(anio, mes - 1, 1);
    const fechaFin = new Date(anio, mes, 0);
    fechaFin.setHours(23, 59, 59, 999); // 1. Denominador: Contar todos los pagos que SÍ se pagaron en el mes

    const totalPagados = await Pago.count({
      where: {
        estado_pago: "pagado",
        fecha_pago: { [Op.between]: [fechaInicio, fechaFin] },
      },
    });

    if (totalPagados === 0) {
      return { tasa_pagos_a_tiempo: "0.00", total_pagados: 0 };
    } // 2. Numerador: Contar pagos 'pagados' donde la fecha_pago <= fecha_vencimiento

    const pagosATiempo = await Pago.count({
      where: {
        estado_pago: "pagado",
        fecha_pago: { [Op.between]: [fechaInicio, fechaFin] },
        [Op.and]: [
          sequelize.where(sequelize.col("fecha_pago"), {
            [Op.lte]: sequelize.col("fecha_vencimiento"), // Condición para "A Tiempo"
          }),
        ],
      },
    });

    const tasaATiempo = (pagosATiempo / totalPagados) * 100;

    return {
      total_pagados: totalPagados,
      pagos_a_tiempo: pagosATiempo,
      tasa_pagos_a_tiempo: tasaATiempo.toFixed(2), // KPI 3
    };
  },
};

module.exports = pagoService;
