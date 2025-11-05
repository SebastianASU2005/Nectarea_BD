// Archivo: services/pago.service.js

const { Op } = require("sequelize");
const Pago = require("../models/Pago");
const SuscripcionProyecto = require("../models/suscripcion_proyecto");
const Usuario = require("../models/usuario");
const Proyecto = require("../models/proyecto");
const emailService = require("./email.service");
const mensajeService = require("./mensaje.service");
const { sequelize } = require("../config/database");
// 🚀 IMPORTACIÓN CLAVE: Servicio para actualizar el resumen de cuenta
const resumenCuentaService = require("./resumen_cuenta.service");

/**
 * Servicio de lógica de negocio para la gestión de Pagos de Suscripciones.
 */
const pagoService = {
  /**
   * @async
   * @function create
   * @description Crea un nuevo registro de Pago.
   * @param {object} data - Datos del pago a crear.
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
   * @description Obtiene todos los pagos asociados a las suscripciones de un usuario.
   * @param {number} id_usuario - ID del usuario.
   * @returns {Promise<Pago[]>} Lista de pagos del usuario.
   */ async findByUserId(id_usuario) {
    // Filtra por la relación de Suscripción que pertenece al usuario
    return Pago.findAll({
      include: [
        {
          model: SuscripcionProyecto,
          as: "suscripcion",
          where: {
            id_usuario: id_usuario, // Filtramos en la tabla intermedia Suscripcion
          },
          required: true, // INNER JOIN: Solo Pagos que tengan una suscripción de este usuario
        },
      ],
    });
  },
  /**
   * @async
   * @function getValidPaymentDetails
   * @description Valida la existencia del Pago, su propiedad por el `userId` y su estado
   * para poder ser pagado (solo `pendiente` o `vencido`).
   * @param {number} pagoId - El ID del pago a procesar.
   * @param {number} userId - El ID del usuario autenticado.
   * @returns {Promise<Pago>} El objeto Pago validado (incluyendo 'suscripcion').
   * @throws {Error} Si el pago no existe, el usuario no es el dueño, o el estado no permite el pago.
   */ async getValidPaymentDetails(pagoId, userId) {
    let pago = null;

    try {
      // 1. Buscar el Pago directamente por su ID (sin include)
      pago = await Pago.findByPk(pagoId);

      if (!pago) {
        throw new Error(`Pago ID ${pagoId} no encontrado.`);
      } // 2. Buscar la Suscripción asociada. Esta búsqueda garantiza que: //    a) La suscripción existe para ese pago (por id: pago.id_suscripcion). //    b) La suscripción pertenece al usuario actual (por id_usuario: userId). //    c) La suscripción está activa (por activo: true).

      const suscripcion = await SuscripcionProyecto.findOne({
        where: {
          id: pago.id_suscripcion,
          activo: true,
          id_usuario: userId, // 🎯 CLAVE: Valida propiedad y activa en una sola consulta
        },
        attributes: ["id_usuario", "id_proyecto"],
      });

      if (!suscripcion) {
        // Si la suscripción no se encuentra, es porque no cumple alguna de las 3 condiciones anteriores.
        throw new Error(
          `Pago ID ${pagoId} encontrado, pero la suscripción asociada no está activa o no te pertenece.`
        );
      } // 3. Validar la propiedad final del Pago (usando el ID de la suscripción ya validado)

      const propietarioId = suscripcion.id_usuario; // Esta validación de propiedad es ahora un doble chequeo, pero debe mantenerse por seguridad

      if (String(propietarioId) !== String(userId)) {
        // Esto solo se lanzaría si hay una inconsistencia a nivel de base de datos
        throw new Error(
          "Acceso denegado. No eres el propietario de este pago."
        );
      } // 4. Validar el estado del pago (el Pago 11 está en estado 'vencido', lo cual es permitido)

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
      } // Adjuntamos el objeto suscripcion al pago para que el resto del flujo (en markAsPaid) funcione

      pago.dataValues.suscripcion = suscripcion;

      return pago;
    } catch (error) {
      // Re-lanza un error con un mensaje más contextual
      throw new Error(`Error en la validación del pago: ${error.message}`);
    }
  },
  /**
   * @async
   * @function generarPagoMensualConDescuento
   * @description Genera un nuevo registro de pago mensual para una suscripción, aplicando el saldo a favor
   * y decrementando el contador de meses restantes a pagar.
   * ✅ CORREGIDO: Ahora SIEMPRE asigna id_usuario e id_proyecto desde la suscripción.
   * @param {number} suscripcionId - ID de la suscripción.
   * @param {object} [options] - Opciones de Sequelize (ej. transaction).
   * @returns {Promise<Pago|object>} El nuevo pago generado o un mensaje si no hay meses restantes.
   * @throws {Error} Si la suscripción o proyecto no existen.
   */ async generarPagoMensualConDescuento(suscripcionId, options = {}) {
    const t = options.transaction || (await sequelize.transaction());
    try {
      // 1. Buscar Suscripción y Proyecto asociado
      const suscripcion = await SuscripcionProyecto.findByPk(suscripcionId, {
        transaction: t,
        include: [
          {
            model: Proyecto,
            as: "proyectoAsociado",
          },
        ],
      });

      if (!suscripcion || !suscripcion.proyectoAsociado) {
        if (!options.transaction) await t.rollback();
        throw new Error("Suscripción o proyecto no encontrado.");
      } // 🚨 DEFENSA: Prevenir la creación de pagos si la suscripción no tiene un ID de usuario válido.

      if (!suscripcion.id_usuario) {
        if (!options.transaction) await t.rollback();
        throw new Error(
          `Suscripción ${suscripcionId} no tiene ID de usuario. Imposible generar pago.`
        );
      } // 🚨 NUEVA DEFENSA: Verificar que el proyecto tenga un ID válido

      if (!suscripcion.id_proyecto) {
        if (!options.transaction) await t.rollback();
        throw new Error(
          `Suscripción ${suscripcionId} no tiene ID de proyecto. Imposible generar pago.`
        );
      } // 2. Verificar si quedan meses por pagar

      if (suscripcion.meses_a_pagar <= 0) {
        if (!options.transaction) await t.commit();
        return {
          message: "No hay más meses por pagar en esta suscripción.",
        };
      } // 3. Determinar el número de mes del pago

      const ultimoPago = await Pago.findOne({
        where: { id_suscripcion: suscripcionId },
        order: [["mes", "DESC"]], // Obtener el último mes pagado/generado
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
        montoAPagar = Math.max(0, cuotaMensual - saldoAFavor); // Calcula el monto real a pagar
        saldoAFavor = Math.max(0, saldoAFavor - cuotaMensual); // Actualiza el saldo restante // Actualiza el saldo a favor de la suscripción

        await suscripcion.update(
          { saldo_a_favor: saldoAFavor.toFixed(2) },
          { transaction: t }
        );
      } // Si el monto a pagar es cero (cubierto totalmente por saldo a favor)

      if (montoAPagar === 0) {
        estado_pago = "cubierto_por_puja";
      } // 5. Calcular la fecha de vencimiento (Día 10 del mes actual)

      const now = new Date();
      const fechaVencimiento = new Date(
        now.getFullYear(),
        now.getMonth(),
        10 // Día 10
      );
      fechaVencimiento.setHours(0, 0, 0, 0); // 6. ✅ CRÍTICO: Crear el nuevo registro de Pago CON id_usuario e id_proyecto

      const nuevoPago = await Pago.create(
        {
          id_suscripcion: suscripcion.id,
          id_usuario: suscripcion.id_usuario, // ✅ ASIGNACIÓN EXPLÍCITA
          id_proyecto: suscripcion.id_proyecto, // ✅ ASIGNACIÓN EXPLÍCITA
          monto: montoAPagar.toFixed(2),
          fecha_vencimiento: fechaVencimiento,
          estado_pago: estado_pago,
          mes: proximoMes,
        },
        { transaction: t }
      );

      console.log(
        `✅ Pago creado con ID Usuario: ${nuevoPago.id_usuario}, ID Proyecto: ${nuevoPago.id_proyecto}`
      ); // 7. Decrementar meses restantes a pagar

      await suscripcion.decrement("meses_a_pagar", {
        by: 1,
        transaction: t,
      });

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
   * @description Gestiona la lógica después de un intento fallido de pago.
   * **Cancela el pago solo si es el MES 1** (lo que implica que la Suscripción debe ser cancelada/inactivada externamente).
   * Para Mes > 1, lo deja en 'pendiente' o 'vencido' para reintento.
   * @param {number} pagoId - ID del pago afectado.
   * @param {object} t - Objeto de transacción de Sequelize.
   * @returns {Promise<Pago>} El pago actualizado.
   * @throws {Error} Si el pago no es encontrado.
   */ async handlePaymentFailure(pagoId, t) {
    try {
      const pago = await Pago.findByPk(pagoId, { transaction: t });

      if (!pago) {
        throw new Error("Pago no encontrado para manejar la falla.");
      }

      if (pago.mes === 1 && pago.estado_pago === "pendiente") {
        // Lógica de cancelación forzada para el primer mes
        await pago.update(
          {
            estado_pago: "cancelado",
            fecha_pago: null,
          },
          { transaction: t }
        );
        console.log(
          `Pago ID ${pagoId} (Mes 1) cancelado debido a la falla de la transacción.`
        );
        return pago;
      } // Para Mes > 1, el estado se mantiene pendiente/vencido para permitir el reintento.

      console.log(
        `Pago ID ${pagoId} (Mes ${pago.mes}) mantiene su estado pendiente/vencido tras la falla de la transacción.`
      );
      return pago;
    } catch (error) {
      throw error;
    }
  },
  /**
   * @async
   * @function markAsPaid
   * @description Marca un pago como `pagado`, registra la fecha y envía notificaciones por email y mensaje interno.
   * @param {number} pagoId - ID del pago a confirmar.
   * @param {object} t - Objeto de transacción de Sequelize.
   * @returns {Promise<Pago>} El pago confirmado.
   * @throws {Error} Si el pago, usuario o proyecto no son encontrados.
   */
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

      if (!pago) {
        throw new Error("Pago no encontrado.");
      }
      if (pago.estado_pago === "pagado") {
        return pago;
      }

      const usuario = pago.suscripcion?.usuario;
      const proyecto = pago.suscripcion?.proyectoAsociado;

      if (!usuario || !proyecto) {
        throw new Error(
          "No se pudo determinar el Usuario o Proyecto asociado al pago para enviar notificaciones."
        );
      }

      await pago.update(
        {
          estado_pago: "pagado",
          fecha_pago: new Date(),
        },
        { transaction: t }
      );

      await resumenCuentaService.updateAccountSummaryOnPayment(
        pago.id_suscripcion,
        { transaction: t }
      );

      // 🔧 CORRECCIÓN: Usar función específica de emailService
      await emailService.notificarPagoRecibido(
        usuario,
        proyecto,
        pago.monto,
        pago.mes
      );

      const remitente_id = 1;
      const contenido = `Tu pago de $${pago.monto} para la cuota #${pago.mes} del proyecto "${proyecto.nombre_proyecto}" ha sido procesado exitosamente.`;
      await mensajeService.crear(
        {
          id_remitente: remitente_id,
          id_receptor: usuario.id,
          contenido: contenido,
        },
        { transaction: t }
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
   * 🚨 CLAVE: Actualiza el resumen de cuenta para reflejar la nueva cuota vencida.
   * @returns {Promise<number>} Número de pagos actualizados a 'vencido'.
   * @throws {Error} Si ocurre un error de base de datos.
   */ async markOverduePayments() {
    const t = await sequelize.transaction();
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Establecer la fecha actual a medianoche para la comparación // 1. Buscar todos los pagos PENDIENTES cuya fecha de vencimiento es ANTERIOR a hoy.

      const paymentsToUpdate = await Pago.findAll({
        where: {
          estado_pago: "pendiente",
          fecha_vencimiento: {
            [Op.lt]: today, // 'Less Than' (Menor que, es decir, ya venció)
          },
        },
        transaction: t,
      });

      if (paymentsToUpdate.length === 0) {
        await t.commit();
        return 0;
      }

      console.log(
        `Se encontraron ${paymentsToUpdate.length} pagos para marcar como vencidos.`
      ); // 2. Actualizar el estado y el resumen de cuenta para cada pago vencido.

      for (const pago of paymentsToUpdate) {
        // a) Actualizar el estado del Pago a 'vencido'
        await pago.update({ estado_pago: "vencido" }, { transaction: t }); // b) 🚨 Llamada al servicio: Registrar la cuota vencida en el resumen de cuenta

        await resumenCuentaService.updateAccountSummaryOnOverdue(
          pago.id_suscripcion,
          { transaction: t }
        ); // c) Enviar notificación (opcional, pero buena práctica) // Aquí podríamos buscar el usuario y enviar un email o mensaje interno de 'pago vencido'
      }

      await t.commit();
      return paymentsToUpdate.length;
    } catch (error) {
      await t.rollback();
      console.error("Error en markOverduePayments:", error.message);
      throw new Error(`Error al procesar pagos vencidos: ${error.message}`);
    }
  }, // <-- COMA AÑADIDA
  /**
   * @async
   * @function deleteCanceledPayments
   * @description Elimina físicamente los registros de pagos que están en estado `cancelado`.
   * @returns {Promise<number>} Número de filas eliminadas.
   * @throws {Error} Si ocurre un error de base de datos.
   */ async deleteCanceledPayments() {
    try {
      const result = await Pago.destroy({
        where: {
          estado_pago: "cancelado",
        },
      });
      return result; // Retorna el número de filas eliminadas
    } catch (error) {
      throw new Error(`Error al eliminar pagos cancelados: ${error.message}`);
    }
  },
  /**
   * @async
   * @function findPaymentsDueSoon
   * @description Busca pagos pendientes cuya fecha de vencimiento esté entre hoy y los próximos 3 días.
   * Incluye la información del proyecto y usuario para el envío de recordatorios.
   * @returns {Promise<Pago[]>} Lista de pagos a vencer pronto.
   */ async findPaymentsDueSoon() {
    const today = new Date();
    const threeDaysFromNow = new Date();
    threeDaysFromNow.setDate(today.getDate() + 3); // Ajustar los rangos de fecha para incluir el día completo

    today.setHours(0, 0, 0, 0);
    threeDaysFromNow.setHours(23, 59, 59, 999);

    return Pago.findAll({
      where: {
        estado_pago: "pendiente",
        fecha_vencimiento: {
          [Op.between]: [today, threeDaysFromNow], // Pagos entre hoy y dentro de 3 días
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
   * @description Busca pagos que el gestor de vencimiento ya marcó como 'vencido'.
   * @returns {Promise<Pago[]>} Lista de pagos vencidos.
   */ async findOverduePayments() {
    return Pago.findAll({
      where: {
        estado_pago: "vencido",
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
   * @function updateLastNotificationDate
   * @description Actualiza la fecha de la última notificación de un pago, para evitar el envío repetido de recordatorios.
   * @param {number} id_pago - ID del pago a actualizar.
   * @throws {Error} Si falla la actualización.
   */ async updateLastNotificationDate(id_pago) {
    try {
      await Pago.update(
        {
          fecha_ultima_notificacion: new Date(),
        },
        {
          where: {
            id: id_pago, // Asume que la clave es `id` o `id_pago`
          },
        }
      );
    } catch (error) {
      throw error;
    }
  },
  /**
   * @async
   * @function getMonthlyPaymentMetrics
   * @description Calcula el total de pagos generados, pagados y vencidos en un mes/año específicos.
   * @param {number} mes - El mes a consultar (1-12).
   * @param {number} anio - El año a consultar.
   * @returns {Promise<object>} Objeto con las métricas agregadas.
   */
  async getMonthlyPaymentMetrics(mes, anio) {
    // 1. Definir el rango de fechas para el mes/año
    const fechaInicio = new Date(anio, mes - 1, 1); // El mes es 0-indexado
    const fechaFin = new Date(anio, mes, 0); // Día 0 del mes siguiente es el último día del mes actual
    fechaFin.setHours(23, 59, 59, 999);

    // 2. Usar Sequelize para la agregación
    const resultados = await Pago.findAll({
      attributes: [
        // Agrupamos y contamos por estado, y sumamos el monto total pagado.
        [
          sequelize.literal(
            `SUM(CASE WHEN estado_pago = 'pagado' THEN monto ELSE 0 END)`
          ),
          "total_recaudado", // Corresponde al KPI 2: Recaudo Mensual Neto
        ],
        [
          sequelize.literal(`COUNT(*)`),
          "total_pagos_generados", // Denominador para la Tasa de Morosidad
        ],
        [
          sequelize.literal(
            `SUM(CASE WHEN estado_pago = 'vencido' THEN 1 ELSE 0 END)`
          ),
          "total_pagos_vencidos", // Numerador para la Tasa de Morosidad
        ],
        [
          sequelize.literal(
            `SUM(CASE WHEN estado_pago = 'pagado' THEN 1 ELSE 0 END)`
          ),
          "total_pagos_pagados",
        ],
      ],
      where: {
        // Asumiendo que el campo 'createdAt' (fecha de creación del pago) es el indicador
        // de cuándo se generó la cuota mensual para el proyecto.
        createdAt: {
          [Op.between]: [fechaInicio, fechaFin],
        },
        // Aseguramos que solo contamos pagos activos (no cancelados ni eliminados si el modelo `Pago` tiene 'activo')
        // Aunque el modelo `Pago` no tiene `activo`, podemos filtrar estados finales irrelevantes si es necesario, pero por simplicidad nos basaremos en los estados.
      },
      raw: true,
    });

    // 3. Procesar resultados
    const data = resultados[0];
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
   * @description Calcula el porcentaje de pagos que se efectuaron antes o en su fecha de vencimiento.
   * @param {number} mes - Mes a consultar (1-12).
   * @param {number} anio - Año a consultar.
   * @returns {Promise<object>} Objeto con el porcentaje de pagos a tiempo.
   */
  async getOnTimePaymentRate(mes, anio) {
    const fechaInicio = new Date(anio, mes - 1, 1);
    const fechaFin = new Date(anio, mes, 0);
    fechaFin.setHours(23, 59, 59, 999);

    // 1. Contar todos los pagos que SÍ se pagaron en el mes (denominador)
    const totalPagados = await Pago.count({
      where: {
        estado_pago: "pagado",
        fecha_pago: {
          [Op.between]: [fechaInicio, fechaFin],
        },
      },
    });

    if (totalPagados === 0) {
      return { tasa_pagos_a_tiempo: 0.0, total_pagados: 0 };
    }

    // 2. Contar pagos 'pagados' donde la fecha_pago fue <= fecha_vencimiento (numerador)
    const pagosATiempo = await Pago.count({
      where: {
        estado_pago: "pagado",
        fecha_pago: {
          [Op.between]: [fechaInicio, fechaFin],
        },
        // Condición para "A Tiempo"
        [Op.and]: [
          sequelize.where(sequelize.col("fecha_pago"), {
            [Op.lte]: sequelize.col("fecha_vencimiento"), // fecha_pago <= fecha_vencimiento
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
