// Archivo: services/pago.service.js

const { Op } = require("sequelize");
const Pago = require("../models/pago");
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
  },
  /**
   * @async
   * @function findAll
   * @description Obtiene todos los registros de Pagos.
   * @returns {Promise<Pago[]>} Lista de todos los pagos.
   */ async findAll() {
    return Pago.findAll();
  },
  /**
   * @async
   * @function findById
   * @description Obtiene un pago por su clave primaria.
   * @param {number} id - ID del pago.
   * @param {object} [options] - Opciones de Sequelize (ej. include).
   * @returns {Promise<Pago|null>} El pago encontrado.
   */ async findById(id, options = {}) {
    return Pago.findByPk(id, options);
  },
  /**
   * @async
   * @function findByUserId
   * @description Obtiene el historial COMPLETO de todos los pagos de un usuario (todos los estados).
   */
  async findByUserId(id_usuario) {
    return Pago.findAll({
      where: { id_usuario: id_usuario }, // Filtro directo por el ID del usuario en la tabla pagos
      include: [
        {
          model: SuscripcionProyecto,
          as: "suscripcion",
          include: [{ model: Proyecto, as: "proyectoAsociado" }],
        },
      ],
      order: [
        ["fecha_vencimiento", "ASC"], // Los más antiguos o próximos a vencer primero
        ["mes", "ASC"],
      ],
    });
  },
  /**
   * @async
   * @function getValidPaymentDetails
   * @description Valida la existencia, la propiedad del usuario y el estado para poder procesar el pago.
   * @param {number} pagoId - El ID del pago a procesar.
   * @param {number} userId - El ID del usuario autenticado.
   * @returns {Promise<Pago>} El objeto Pago validado (con `suscripcion` adjunta en `dataValues`).
   * @throws {Error} Si el pago no existe, no es del usuario, está inactivo o ya fue pagado/cancelado.
   */ async getValidPaymentDetails(pagoId, userId) {
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
          `Pago ID ${pagoId} encontrado, pero la suscripción asociada no está activa o no te pertenece.`,
        );
      } // 3. Validar estado del pago

      const estadoActual = pago.estado_pago;
      const estadosFinales = ["pagado", "cancelado", "cubierto_por_puja"];
      const estadosPermitidos = ["pendiente", "vencido"];

      if (estadosFinales.includes(estadoActual)) {
        throw new Error(
          `El pago ID ${pagoId} ya se encuentra en estado: ${estadoActual}.`,
        );
      }
      if (!estadosPermitidos.includes(estadoActual)) {
        throw new Error(
          `Estado de pago inválido (${estadoActual}). Solo se pueden pagar estados PENDIENTE o VENCIDO.`,
        );
      } // Adjuntar Suscripción al Pago para uso posterior (ej. en markAsPaid)

      pago.dataValues.suscripcion = suscripcion;

      return pago;
    } catch (error) {
      throw new Error(`Error en la validación del pago: ${error.message}`);
    }
  },
  /**
   * @async
   * @function generarPagoMensualConDescuento
   * @description Genera un nuevo registro de pago mensual, aplicando el saldo a favor de la suscripción.
   * @param {number} suscripcionId - ID de la suscripción.
   * @param {object} [options] - Opciones de Sequelize (ej. transaction).
   * @returns {Promise<Pago|object>} El nuevo pago generado o un mensaje si no hay meses restantes.
   * @throws {Error} Si la suscripción o proyecto no existen o faltan IDs clave.
   */ async generarPagoMensualConDescuento(suscripcionId, options = {}) {
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
        suscripcion.proyectoAsociado.monto_inversion,
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
          { transaction: t },
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
        { transaction: t },
      ); // 7. Decrementar meses restantes a pagar

      await suscripcion.decrement("meses_a_pagar", { by: 1, transaction: t });

      if (!options.transaction) await t.commit();
      return nuevoPago;
    } catch (error) {
      if (t && !options.transaction) await t.rollback();
      throw error;
    }
  },
  /**
   * @async
   * @function handlePaymentFailure
   * @description Gestiona la lógica después de un intento fallido de pago. Cancela el pago solo si es el **Mes 1**;
   * en otros casos, lo deja en 'pendiente' o 'vencido' para reintento.
   * @param {number} pagoId - ID del pago afectado.
   * @param {object} t - Objeto de transacción de Sequelize.
   * @returns {Promise<Pago>} El pago actualizado.
   * @throws {Error} Si el pago no es encontrado.
   */ async handlePaymentFailure(pagoId, t) {
    const pago = await Pago.findByPk(pagoId, { transaction: t });

    if (!pago) {
      throw new Error("Pago no encontrado para manejar la falla.");
    } // Lógica de cancelación forzada para el primer mes

    if (pago.mes === 1 && pago.estado_pago === "pendiente") {
      await pago.update(
        { estado_pago: "cancelado", fecha_pago: null },
        { transaction: t },
      );
      console.log(
        `Pago ID ${pagoId} (Mes 1) cancelado debido a la falla de la transacción.`,
      );
      return pago;
    } // Para Mes > 1, el estado se mantiene pendiente/vencido.

    console.log(
      `Pago ID ${pagoId} (Mes ${pago.mes}) mantiene su estado pendiente/vencido tras la falla de la transacción.`,
    );
    return pago;
  },
  /**
   * @async
   * @function markAsPaid
   * @description Marca un pago como `pagado`, registra la fecha, actualiza el resumen de cuenta y envía notificaciones.
   * @param {number} pagoId - ID del pago a confirmar.
   * @param {object} t - Objeto de transacción de Sequelize.
   * @returns {Promise<Pago>} El pago confirmado.
   * @throws {Error} Si el pago, usuario o proyecto no son encontrados.
   */ async markAsPaid(pagoId, t) {
    try {
      const pago = await Pago.findByPk(pagoId, {
        transaction: t,
        lock: t.LOCK.UPDATE,
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
          "No se pudo determinar el Usuario o Proyecto asociado al pago para enviar notificaciones.",
        );
      } // 1. Actualizar el estado del Pago

      await pago.update(
        { estado_pago: "pagado", fecha_pago: new Date() },
        { transaction: t },
      ); // 2. 🚨 CRÍTICO: Actualizar el resumen de cuenta (disminuir cuotas vencidas, actualizar saldo)

      await resumenCuentaService.updateAccountSummaryOnPayment(
        pago.id_suscripcion,
        { transaction: t },
      ); // 3. Notificaciones

      await emailService.notificarPagoRecibido(
        usuario,
        proyecto,
        pago.monto,
        pago.mes,
      );
      const contenido = `Tu pago de $${pago.monto} para la cuota #${pago.mes} del proyecto "${proyecto.nombre_proyecto}" ha sido procesado exitosamente.`;
      await mensajeService.crear(
        { id_remitente: 1, id_receptor: usuario.id, contenido: contenido },
        { transaction: t },
      );

      return pago;
    } catch (error) {
      throw error;
    }
  },
  /**
   * @async
   * @function markOverduePayments
   * @description Identifica y marca todos los pagos 'pendiente' cuya fecha de vencimiento ya pasó.
   * Actualiza el resumen de cuenta para reflejar la nueva cuota vencida.
   * @returns {Promise<number>} Número de pagos actualizados a 'vencido'.
   * @throws {Error} Si ocurre un error de base de datos.
   */ async markOverduePayments() {
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
          { transaction: t },
        ); // c) (Opcional) Notificación de pago vencido
      }

      await t.commit();
      return paymentsToUpdate.length;
    } catch (error) {
      await t.rollback();
      console.error("Error en markOverduePayments:", error.message);
      throw new Error(`Error al procesar pagos vencidos: ${error.message}`);
    }
  },
  /**
   * @async
   * @function deleteCanceledPayments
   * @description Elimina físicamente los registros de pagos que están en estado `cancelado`.
   * @returns {Promise<number>} Número de filas eliminadas.
   * @throws {Error} Si ocurre un error de base de datos.
   */ async deleteCanceledPayments() {
    try {
      const result = await Pago.destroy({
        where: { estado_pago: "cancelado" },
      });
      return result;
    } catch (error) {
      throw new Error(`Error al eliminar pagos cancelados: ${error.message}`);
    }
  },
  /**
   * @async
   * @function findPaymentsDueSoon
   * @description Busca pagos pendientes cuya fecha de vencimiento esté entre hoy y los próximos 3 días (para recordatorios).
   * @returns {Promise<Pago[]>} Lista de pagos a vencer pronto, incluyendo detalles de proyecto y usuario.
   */ async findPaymentsDueSoon() {
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
  },
  /**
   * @async
   * @function findOverduePayments
   * @description Busca pagos que ya fueron marcados como 'vencido'.
   * @returns {Promise<Pago[]>} Lista de pagos vencidos, incluyendo detalles de proyecto y usuario.
   */ async findOverduePayments() {
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
  },
  /**
   * @async
   * @function updateLastNotificationDate
   * @description Actualiza la fecha de la última notificación de un pago.
   * @param {number} id_pago - ID del pago a actualizar.
   * @throws {Error} Si falla la actualización.
   */ async updateLastNotificationDate(id_pago) {
    try {
      await Pago.update(
        { fecha_ultima_notificacion: new Date() },
        { where: { id: id_pago } },
      );
    } catch (error) {
      throw error;
    }
  },
  /**
   * @async
   * @function getMonthlyPaymentMetrics
   * @description Calcula el total de pagos generados, pagados y vencidos en un mes/año específicos,
   * incluyendo la Tasa de Morosidad (KPI 1) y el Recaudo Mensual Neto (KPI 2).
   * @param {number} mes - El mes a consultar (1-12).
   * @param {number} anio - El año a consultar.
   * @returns {Promise<object>} Objeto con las métricas agregadas.
   */ async getMonthlyPaymentMetrics(mes, anio) {
    // 1. Definir el rango de fechas (fecha de creación del pago)
    const fechaInicio = new Date(anio, mes - 1, 1);
    const fechaFin = new Date(anio, mes, 0);
    fechaFin.setHours(23, 59, 59, 999); // 2. Usar Sequelize para la agregación condicional (SQL `CASE WHEN`)

    const resultados = await Pago.findAll({
      attributes: [
        // KPI 2: Recaudo total
        [
          sequelize.literal(
            `SUM(CASE WHEN estado_pago = 'pagado' THEN monto ELSE 0 END)`,
          ),
          "total_recaudado",
        ], // Denominador y Total Pagados
        [sequelize.literal(`COUNT(*)`), "total_pagos_generados"], // Numerador Morosidad
        [
          sequelize.literal(
            `SUM(CASE WHEN estado_pago = 'vencido' THEN 1 ELSE 0 END)`,
          ),
          "total_pagos_vencidos",
        ], // Conteo Pagados
        [
          sequelize.literal(
            `SUM(CASE WHEN estado_pago = 'pagado' THEN 1 ELSE 0 END)`,
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
  },
  /**
   * @async
   * @function getOnTimePaymentRate
   * @description Calcula el porcentaje de pagos que se efectuaron **antes o en su fecha de vencimiento** (KPI 3).
   * Se basa en la fecha de pago (`fecha_pago`).
   * @param {number} mes - Mes a consultar (1-12).
   * @param {number} anio - Año a consultar.
   * @returns {Promise<object>} Objeto con el porcentaje de pagos a tiempo.
   */ async getOnTimePaymentRate(mes, anio) {
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
  /**
   * @async
   * @function actualizarMontoPago
   * @description Permite cambiar el monto de un pago PENDIENTE o VENCIDO.
   * Solo permite modificar pagos que aún no han sido pagados.
   * @param {number} pagoId - ID del pago a modificar.
   * @param {number} nuevoMonto - Nuevo monto del pago.
   * @param {string} [motivoCambio] - Razón del cambio de monto (para auditoría).
   * @returns {Promise<Pago>} El pago actualizado.
   * @throws {Error} Si el pago no existe, no está en estado modificable o el monto es inválido.
   */
  async actualizarMontoPago(pagoId, nuevoMonto, motivoCambio = null) {
    const pago = await Pago.findByPk(pagoId);

    if (!pago) {
      throw new Error(`Pago ID ${pagoId} no encontrado.`);
    }

    // Solo se pueden modificar pagos pendientes o vencidos
    if (!["pendiente", "vencido"].includes(pago.estado_pago)) {
      throw new Error(
        `No se puede modificar el monto de un pago en estado '${pago.estado_pago}'. Solo se permiten estados: pendiente, vencido.`,
      );
    }

    if (nuevoMonto <= 0 || isNaN(nuevoMonto)) {
      throw new Error("El nuevo monto debe ser un número positivo válido.");
    }

    // Registrar el cambio para auditoría
    console.log(`[AUDITORÍA] Cambio de monto en Pago ID ${pagoId}:
    Monto anterior: $${pago.monto}
    Monto nuevo: $${nuevoMonto}
    Motivo: ${motivoCambio || "No especificado"}
    Fecha: ${new Date().toISOString()}`);

    await pago.update({
      monto: parseFloat(nuevoMonto).toFixed(2),
    });

    return pago;
  },

  /**
   * @async
   * @function generarPagosAdelantados
   * @description Genera múltiples pagos por adelantado para una suscripción.
   * Útil cuando un usuario quiere pagar varios meses de una vez.
   * @param {number} suscripcionId - ID de la suscripción.
   * @param {number} cantidadMeses - Número de meses a generar.
   * @param {number} [montoPorMes] - Monto personalizado por mes (opcional, por defecto usa el del proyecto).
   * @param {object} [options] - Opciones de Sequelize (ej. transaction).
   * @returns {Promise<Pago[]>} Array de pagos generados.
   * @throws {Error} Si la suscripción no existe, no tiene meses restantes o los parámetros son inválidos.
   */
  async generarPagosAdelantados(
    suscripcionId,
    cantidadMeses,
    montoPorMes = null,
    options = {},
  ) {
    const t = options.transaction || (await sequelize.transaction());

    try {
      // 1. Validar la suscripción
      const suscripcion = await SuscripcionProyecto.findByPk(suscripcionId, {
        transaction: t,
        include: [{ model: Proyecto, as: "proyectoAsociado" }],
      });

      if (!suscripcion || !suscripcion.proyectoAsociado) {
        if (!options.transaction) await t.rollback();
        throw new Error(
          `Suscripción ID ${suscripcionId} no encontrada o sin proyecto asociado.`,
        );
      }

      if (!suscripcion.activo) {
        if (!options.transaction) await t.rollback();
        throw new Error(`La suscripción ID ${suscripcionId} no está activa.`);
      }

      // 2. Validar parámetros
      if (!cantidadMeses || cantidadMeses < 1 || cantidadMeses > 12) {
        if (!options.transaction) await t.rollback();
        throw new Error("La cantidad de meses debe estar entre 1 y 12.");
      }

      if (suscripcion.meses_a_pagar <= 0) {
        if (!options.transaction) await t.rollback();
        throw new Error("Esta suscripción no tiene meses restantes por pagar.");
      }

      // Limitar la cantidad de meses a generar por los meses restantes
      const mesesAGenerar = Math.min(cantidadMeses, suscripcion.meses_a_pagar);

      if (mesesAGenerar < cantidadMeses) {
        console.warn(
          `⚠️ Solo se generarán ${mesesAGenerar} pagos (meses restantes en la suscripción).`,
        );
      }

      // 3. Determinar el monto por mes
      const montoBase = montoPorMes
        ? parseFloat(montoPorMes)
        : parseFloat(suscripcion.proyectoAsociado.monto_inversion);

      if (montoBase <= 0 || isNaN(montoBase)) {
        if (!options.transaction) await t.rollback();
        throw new Error("El monto por mes debe ser un número positivo válido.");
      }

      // 4. Encontrar el último mes pagado/generado
      const ultimoPago = await Pago.findOne({
        where: { id_suscripcion: suscripcionId },
        order: [["mes", "DESC"]],
        transaction: t,
      });

      const proximoMes = ultimoPago ? ultimoPago.mes + 1 : 1;

      // 5. Generar los pagos
      const pagosGenerados = [];
      let saldoRestante = parseFloat(suscripcion.saldo_a_favor);

      for (let i = 0; i < mesesAGenerar; i++) {
        const numeroMes = proximoMes + i;

        // Aplicar saldo a favor si existe
        let montoAPagar = montoBase;
        let estadoPago = "pendiente";

        if (saldoRestante > 0) {
          const descuentoAplicado = Math.min(montoBase, saldoRestante);
          montoAPagar = montoBase - descuentoAplicado;
          saldoRestante -= descuentoAplicado;

          if (montoAPagar === 0) {
            estadoPago = "cubierto_por_puja";
          }
        }

        // Calcular fecha de vencimiento (día 10 del mes correspondiente)
        const now = new Date();
        const fechaVencimiento = new Date(
          now.getFullYear(),
          now.getMonth() + i,
          10,
        );
        fechaVencimiento.setHours(0, 0, 0, 0);

        // Crear el pago
        const nuevoPago = await Pago.create(
          {
            id_suscripcion: suscripcion.id,
            id_usuario: suscripcion.id_usuario,
            id_proyecto: suscripcion.id_proyecto,
            monto: montoAPagar.toFixed(2),
            fecha_vencimiento: fechaVencimiento,
            estado_pago: estadoPago,
            mes: numeroMes,
          },
          { transaction: t },
        );

        pagosGenerados.push(nuevoPago);

        // Decrementar meses_a_pagar de la suscripción
        await suscripcion.decrement("meses_a_pagar", { by: 1, transaction: t });
      }

      // 6. Actualizar el saldo a favor si cambió
      if (saldoRestante !== parseFloat(suscripcion.saldo_a_favor)) {
        await suscripcion.update(
          { saldo_a_favor: saldoRestante.toFixed(2) },
          { transaction: t },
        );
      }

      if (!options.transaction) await t.commit();

      console.log(
        `✅ Generados ${pagosGenerados.length} pagos adelantados para la Suscripción ID ${suscripcionId}`,
      );

      return pagosGenerados;
    } catch (error) {
      if (t && !options.transaction) await t.rollback();
      throw error;
    }
  },

  /**
   * @async
   * @function findPendingPaymentsBySubscription
   * @description Obtiene todos los pagos pendientes de una suscripción específica.
   * Útil para ver qué pagos ya fueron generados antes de crear nuevos.
   * @param {number} suscripcionId - ID de la suscripción.
   * @returns {Promise<Pago[]>} Lista de pagos pendientes/vencidos.
   */
  async findPendingPaymentsBySubscription(suscripcionId) {
    return Pago.findAll({
      where: {
        id_suscripcion: suscripcionId,
        estado_pago: {
          [Op.in]: ["pendiente", "vencido"],
        },
      },
      order: [["mes", "ASC"]],
    });
  },
  async updatePaymentStatus(pagoId, nuevoEstado, motivo = null) {
    const t = await sequelize.transaction();

    try {
      // 1. Agregar "forzado" a la lista de estados válidos
      const estadosValidos = [
        "pendiente",
        "pagado",
        "vencido",
        "cancelado",
        "cubierto_por_puja",
        "forzado",
      ];

      const pago = await Pago.findByPk(pagoId, { transaction: t });
      if (!pago) throw new Error(`Pago ID ${pagoId} no encontrado.`);

      if (!estadosValidos.includes(nuevoEstado)) {
        throw new Error(`Estado '${nuevoEstado}' inválido.`);
      }

      const estadoAnterior = pago.estado_pago;

      if (estadoAnterior === nuevoEstado) {
        await t.commit();
        return pago;
      }

      // 2. Lógica de fecha: Si es pagado o forzado, se setea la fecha de hoy
      const esEstadoDePagoExitoso = [
        "pagado",
        "forzado",
        "cubierto_por_puja",
      ].includes(nuevoEstado);

      await pago.update(
        {
          estado_pago: nuevoEstado,
          fecha_pago: esEstadoDePagoExitoso ? new Date() : pago.fecha_pago,
          motivo: motivo || null, // 🆕 Persistir el motivo
        },
        { transaction: t },
      );

      // 3. Sincronizar ResumenCuenta
      // Consideramos "forzado" como un estado pagado para el balance
      const estadosQueCuentanComoPagado = [
        "pagado",
        "cubierto_por_puja",
        "forzado",
      ];

      const anteriorEraPagado =
        estadosQueCuentanComoPagado.includes(estadoAnterior);
      const nuevoEsPagado = estadosQueCuentanComoPagado.includes(nuevoEstado);
      const anteriorEraVencido = estadoAnterior === "vencido";
      const nuevoEsVencido = nuevoEstado === "vencido";

      const huboCambioRelevante =
        anteriorEraPagado !== nuevoEsPagado ||
        anteriorEraVencido !== nuevoEsVencido;

      if (huboCambioRelevante) {
        await resumenCuentaService.updateAccountSummaryOnPayment(
          pago.id_suscripcion,
          { transaction: t },
        );
      }

      await t.commit();
      return pago;
    } catch (error) {
      if (t) await t.rollback();
      throw error;
    }
  },
  /**
   * @async
   * @function findAllBySubscription
   * @description Obtiene el historial completo de pagos de una suscripción (para administradores).
   * @param {number} suscripcionId - ID de la suscripción.
   * @returns {Promise<Pago[]>} Lista de todos los pagos (historial completo).
   */
  async findAllBySubscription(suscripcionId) {
    return Pago.findAll({
      where: {
        id_suscripcion: suscripcionId,
      },
      include: [
        { model: Proyecto, as: "proyectoDirecto" }, // Útil para ver a qué proyecto pertenece en el listado
        { model: Usuario, as: "usuarioDirecto" }, // Útil para ver los datos del titular
      ],
      order: [["mes", "ASC"]], // Ordenar cronológicamente por cuota
    });
  },
  /**
   * @async
   * @function findAllBySubscriptionAndUser
   * @description Obtiene el historial de pagos de una suscripción, validando que pertenezca al usuario.
   * @param {number} suscripcionId - ID de la suscripción.
   * @param {number} userId - ID del usuario autenticado.
   * @returns {Promise<Pago[]>}
   * @throws {Error} Si la suscripción no existe o no pertenece al usuario.
   */
  async findAllBySubscriptionAndUser(suscripcionId, userId) {
    // 1. Validar propiedad antes de devolver datos
    const suscripcion = await SuscripcionProyecto.findOne({
      where: {
        id: suscripcionId,
        id_usuario: userId, // 🎯 Clave: solo la suscripción del usuario autenticado
      },
    });

    if (!suscripcion) {
      throw new Error("Suscripción no encontrada o no te pertenece.");
    }

    return Pago.findAll({
      where: {
        id_suscripcion: suscripcionId,
        // ⚠️ IMPORTANTE: No debe haber un filtro de estado_pago aquí
      },
      attributes: [
        "id",
        "monto",
        "estado_pago",
        "mes",
        "fecha_vencimiento",
        "fecha_pago",
        "motivo",
        "createdAt",
      ],
      order: [["mes", "ASC"]],
    });
  },
  /**
   * @async
   * @function cancelPendingPaymentsBySubscription
   * @description Cancela todos los pagos en estado 'pendiente' o 'vencido' de una suscripción.
   * Se usa principalmente al cancelar una suscripción para limpiar los pagos no ejecutados.
   * @param {number} suscripcionId - ID de la suscripción cuyos pagos se van a cancelar.
   * @param {string} [motivo] - Motivo de la cancelación (para auditoría).
   * @param {object} [options] - Opciones de Sequelize (ej. transaction).
   * @returns {Promise<number>} Cantidad de pagos cancelados.
   * @throws {Error} Si ocurre un error de base de datos.
   */
  async cancelPendingPaymentsBySubscription(
    suscripcionId,
    motivo = null,
    options = {},
  ) {
    try {
      const [cantidadActualizada] = await Pago.update(
        {
          estado_pago: "cancelado",
          motivo: motivo || "Cancelación por baja de suscripción",
        },
        {
          where: {
            id_suscripcion: suscripcionId,
            estado_pago: {
              [Op.in]: ["pendiente", "vencido"],
            },
          },
          ...options, // Propaga la transaction si viene
        },
      );

      console.log(
        `[cancelPendingPaymentsBySubscription] Suscripción ID ${suscripcionId}: ${cantidadActualizada} pago(s) cancelado(s). Motivo: ${motivo}`,
      );

      return cantidadActualizada;
    } catch (error) {
      throw new Error(
        `Error al cancelar pagos de la suscripción ${suscripcionId}: ${error.message}`,
      );
    }
  },
};

module.exports = pagoService;
