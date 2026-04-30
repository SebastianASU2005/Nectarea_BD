// services/adhesion.service.js
const Adhesion = require("../models/adhesion");
const PagoAdhesion = require("../models/pagoAdhesion");
const SuscripcionProyecto = require("../models/suscripcion_proyecto");
const Proyecto = require("../models/proyecto");
const CuotaMensual = require("../models/CuotaMensual");
const ResumenCuenta = require("../models/resumen_cuenta");
const resumenCuentaService = require("./resumen_cuenta.service");
const { sequelize, Op } = require("../config/database");
const pagoService = require("./pago.service");
const Usuario = require("../models/usuario");
const emailService = require("./email.service");

const adhesionService = {
  /**
   * Crea una nueva adhesión con plan de pago y reserva el cupo creando la suscripción (sin token).
   * Las fechas de vencimiento se calculan siempre a partir del próximo mes (día 10).
   */
  async crearAdhesion(usuarioId, proyectoId, planPago) {
    const t = await sequelize.transaction();
    try {
      // 1. Validar proyecto
      const proyecto = await Proyecto.findByPk(proyectoId, { transaction: t });
      if (!proyecto) throw new Error("Proyecto no existe");
      if (proyecto.tipo_inversion !== "mensual") {
        throw new Error("Solo proyectos mensuales requieren adhesión");
      }
      if (!proyecto.activo) throw new Error("Proyecto inactivo");
      if (proyecto.estado_proyecto === "Finalizado") {
        throw new Error("Proyecto finalizado, no se puede adherir");
      }

      // 3. Verificar que haya cupo disponible
      if (proyecto.suscripciones_actuales >= proyecto.obj_suscripciones) {
        throw new Error(
          `El proyecto ya alcanzó su límite de ${proyecto.obj_suscripciones} suscriptores.`,
        );
      }

      // 4. Obtener la cuota mensual más reciente (valor móvil)
      const cuotaMensual = await CuotaMensual.findOne({
        where: { id_proyecto: proyectoId },
        order: [["createdAt", "DESC"]],
        transaction: t,
      });
      if (!cuotaMensual) {
        throw new Error("El proyecto no tiene cuota mensual definida");
      }

      const valorMovil = parseFloat(cuotaMensual.valor_movil);
      const porcentajeAdhesion = 4.0;
      const montoTotal = valorMovil * (porcentajeAdhesion / 100);

      let cuotasTotales = 1;
      switch (planPago) {
        case "contado":
          cuotasTotales = 1;
          break;
        case "3_cuotas":
          cuotasTotales = 3;
          break;
        case "6_cuotas":
          cuotasTotales = 6;
          break;
        default:
          throw new Error("Plan de pago inválido");
      }
      const montoPorCuota = montoTotal / cuotasTotales;

      // 5. CREAR LA SUSCRIPCIÓN (reserva cupo, sin token, adhesion_completada = false)
      const nuevaSuscripcion = await SuscripcionProyecto.create(
        {
          id_usuario: usuarioId,
          id_proyecto: proyectoId,
          tokens_disponibles: 0,
          meses_a_pagar: proyecto.plazo_inversion,
          saldo_a_favor: 0,
          monto_total_pagado: 0,
          token_consumido: false,
          activo: true,
          adhesion_completada: false,
        },
        { transaction: t },
      );

      // Incrementar contador de suscripciones actuales
      await proyecto.increment("suscripciones_actuales", {
        by: 1,
        transaction: t,
      });

      // 6. Crear la ADHESIÓN
      const adhesion = await Adhesion.create(
        {
          id_usuario: usuarioId,
          id_proyecto: proyectoId,
          id_suscripcion: nuevaSuscripcion.id,
          valor_movil_referencia: valorMovil,
          porcentaje_adhesion: porcentajeAdhesion,
          monto_total_adhesion: montoTotal,
          plan_pago: planPago,
          cuotas_totales: cuotasTotales,
          cuotas_pagadas: 0,
          estado: "pendiente",
          fecha_completada: null,
        },
        { transaction: t },
      );

      const hoy = new Date();
      // Fecha base: primer día del próximo mes a las 00:00 UTC
      let añoPrimerVenc = hoy.getUTCFullYear();
      let mesPrimerVenc = hoy.getUTCMonth() + 1; // próximo mes
      if (mesPrimerVenc > 11) {
        mesPrimerVenc = 0;
        añoPrimerVenc++;
      }
      // Construir string 'YYYY-MM-DD' para el día 10 del mes correspondiente, en UTC
      const primerDiaStr = `${añoPrimerVenc}-${String(mesPrimerVenc + 1).padStart(2, "0")}-10`;
      const fechaBase = new Date(primerDiaStr + "T00:00:00Z"); // objeto Date UTC

      for (let i = 0; i < cuotasTotales; i++) {
        const fechaVencimientoUTC = new Date(fechaBase);
        fechaVencimientoUTC.setUTCMonth(fechaBase.getUTCMonth() + i);
        // Formatear como YYYY-MM-DD para DATEONLY
        const año = fechaVencimientoUTC.getUTCFullYear();
        const mes = String(fechaVencimientoUTC.getUTCMonth() + 1).padStart(
          2,
          "0",
        );
        const dia = String(fechaVencimientoUTC.getUTCDate()).padStart(2, "0");
        const fechaVencimientoStr = `${año}-${mes}-${dia}`;

        await PagoAdhesion.create(
          {
            id_adhesion: adhesion.id,
            numero_cuota: i + 1,
            monto: montoPorCuota,
            fecha_vencimiento: fechaVencimientoStr, // string YYYY-MM-DD
            estado: "pendiente",
          },
          { transaction: t },
        );
      }

      await t.commit();

      // Notificar al usuario por email
      const usuario = await Usuario.findByPk(usuarioId);
      const proyectoCompleto = await Proyecto.findByPk(proyectoId);
      await emailService.notificarAdhesionCreada(
        usuario,
        adhesion,
        proyectoCompleto,
        planPago,
      );

      // Retornar la adhesión con sus pagos y suscripción
      const adhesionConPagos = await Adhesion.findByPk(adhesion.id, {
        include: [
          {
            model: PagoAdhesion,
            as: "pagos",
            order: [["numero_cuota", "ASC"]],
          },
          { model: SuscripcionProyecto, as: "suscripcion" },
        ],
      });
      return adhesionConPagos;
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },

  /**
   * Obtener adhesión por ID (con pagos y suscripción)
   */
  async obtenerAdhesion(id, usuarioId = null) {
    const where = { id };
    if (usuarioId) where.id_usuario = usuarioId;
    return Adhesion.findOne({
      where,
      include: [
        { model: PagoAdhesion, as: "pagos", order: [["numero_cuota", "ASC"]] },
        {
          model: Proyecto,
          as: "proyecto",
          attributes: ["id", "nombre_proyecto", "estado_proyecto"],
        },
        { model: SuscripcionProyecto, as: "suscripcion" },
      ],
    });
  },

  /**
   * Obtener adhesión por ID de suscripción (útil para que el usuario vea sus pagos de adhesión desde su suscripción)
   */
  async obtenerAdhesionPorSuscripcion(suscripcionId, usuarioId = null) {
    const where = { id_suscripcion: suscripcionId };
    if (usuarioId) where.id_usuario = usuarioId;
    return Adhesion.findOne({
      where,
      include: [
        { model: PagoAdhesion, as: "pagos", order: [["numero_cuota", "ASC"]] },
        {
          model: Proyecto,
          as: "proyecto",
          attributes: ["id", "nombre_proyecto", "estado_proyecto"],
        },
        { model: SuscripcionProyecto, as: "suscripcion" },
      ],
    });
  },

  /**
   * Procesar el pago de una cuota de adhesión (llamado desde transacción)
   * Valida que todas las cuotas anteriores estén pagadas (pago secuencial)
   */
  async procesarPagoCuota(adhesionId, numeroCuota, transaccionId, t) {
    // Obtener la cuota con su adhesión y todas las cuotas (para validación)
    const adhesionConCuotas = await Adhesion.findByPk(adhesionId, {
      transaction: t,
      include: [{ model: PagoAdhesion, as: "pagos" }],
    });
    if (!adhesionConCuotas) throw new Error("Adhesión no encontrada");

    const pagoAdhesion = adhesionConCuotas.pagos.find(
      (p) => p.numero_cuota === numeroCuota,
    );
    if (!pagoAdhesion) throw new Error(`Cuota ${numeroCuota} no encontrada`);
    if (!["pendiente", "vencido"].includes(pagoAdhesion.estado)) {
      throw new Error(
        `La cuota ${numeroCuota} no está pendiente ni vencida (estado actual: ${pagoAdhesion.estado}).`,
      );
    }

    // Validar orden: todas las cuotas anteriores deben estar pagadas o forzadas
    const cuotasAnteriores = adhesionConCuotas.pagos.filter(
      (p) => p.numero_cuota < numeroCuota,
    );
    const algunaPendiente = cuotasAnteriores.some((p) =>
      ["pendiente", "vencido"].includes(p.estado),
    );
    if (algunaPendiente) {
      throw new Error(
        `Debes pagar las cuotas anteriores (1 a ${numeroCuota - 1}) antes de pagar la cuota ${numeroCuota}.`,
      );
    }

    // Marcar como pagado
    await pagoAdhesion.update(
      {
        estado: "pagado",
        fecha_pago: new Date().toISOString().slice(0, 10), // ✅ YYYY-MM-DD UTC
        id_transaccion: transaccionId,
      },
      { transaction: t },
    );

    const adhesion = adhesionConCuotas;
    const nuevasPagadas = adhesion.cuotas_pagadas + 1;
    let nuevoEstado = adhesion.estado;
    let fechaCompletada = null;

    if (nuevasPagadas === adhesion.cuotas_totales) {
      nuevoEstado = "completada";
      fechaCompletada = new Date();
      await this._completarAdhesionYActivarSuscripcion(adhesion, t);
    } else {
      nuevoEstado = "en_curso";
    }

    await adhesion.update(
      {
        cuotas_pagadas: nuevasPagadas,
        estado: nuevoEstado,
        fecha_completada: fechaCompletada,
      },
      { transaction: t },
    );

    // Notificar por email después del commit
    t.afterCommit(async () => {
      const usuario = await Usuario.findByPk(adhesion.id_usuario);
      const proyecto = await Proyecto.findByPk(adhesion.id_proyecto);
      await emailService.notificarCuotaAdhesionPagada(
        usuario,
        adhesion,
        pagoAdhesion,
        proyecto,
      );
    });

    return pagoAdhesion;
  },

  /**
   * Cuando se completa la última cuota, activa la suscripción (token = 1, adhesion_completada = true)
   * y crea el resumen de cuenta si no existe.
   */
  async _completarAdhesionYActivarSuscripcion(adhesion, transaction) {
    const suscripcion = await SuscripcionProyecto.findByPk(
      adhesion.id_suscripcion,
      {
        transaction,
        include: [{ model: Proyecto, as: "proyectoAsociado" }],
      },
    );
    if (!suscripcion) throw new Error("Suscripción asociada no encontrada");

    if (suscripcion.adhesion_completada) return; // ya estaba activada

    await suscripcion.update(
      {
        tokens_disponibles: 1,
        adhesion_completada: true,
      },
      { transaction },
    );

    // Crear el resumen de cuenta si el proyecto es mensual
    const proyecto = suscripcion.proyectoAsociado;
    if (proyecto && proyecto.tipo_inversion === "mensual") {
      const resumenExistente = await ResumenCuenta.findOne({
        where: { id_suscripcion: suscripcion.id },
        transaction,
      });
      if (!resumenExistente) {
        await resumenCuentaService.createAccountSummary(suscripcion, proyecto, {
          transaction,
        });
      }
    }

    // Notificar al usuario que completó la adhesión
    transaction.afterCommit(async () => {
      const usuario = await Usuario.findByPk(adhesion.id_usuario);
      const proyectoCompleto = await Proyecto.findByPk(adhesion.id_proyecto);
      await emailService.notificarAdhesionCompletada(
        usuario,
        adhesion,
        suscripcion,
        proyectoCompleto,
      );
    });
  },

  async obtenerCuotasPendientes(adhesionId) {
    return PagoAdhesion.findAll({
      where: {
        id_adhesion: adhesionId,
        estado: { [Op.in]: ["pendiente", "vencido"] },
      },
      order: [["numero_cuota", "ASC"]],
    });
  },

  // ------------------------------------------------------------------
  // CANCELACIÓN DE ADHESIÓN
  // ------------------------------------------------------------------

  async cancelarAdhesion(
    adhesionId,
    userId,
    esAdmin = false,
    motivo = null,
    externalTransaction = null,
  ) {
    const t = externalTransaction || (await sequelize.transaction());
    const shouldCommit = !externalTransaction;
    try {
      // 1. Bloquear solo la fila de Adhesion (sin includes)
      const adhesionLocked = await Adhesion.findByPk(adhesionId, {
        transaction: t,
        lock: t.LOCK.UPDATE,
        attributes: ["id"],
      });
      if (!adhesionLocked) throw new Error("Adhesión no encontrada.");

      // 2. Obtener los datos completos con includes (sin lock)
      const adhesion = await Adhesion.findByPk(adhesionId, {
        transaction: t,
        include: [
          { model: SuscripcionProyecto, as: "suscripcion" },
          { model: Proyecto, as: "proyecto" },
        ],
      });

      if (!esAdmin && adhesion.id_usuario !== userId) {
        throw new Error("No tienes permiso para cancelar esta adhesión.");
      }
      if (adhesion.estado === "completada") {
        throw new Error(
          "La adhesión ya está completada. No se puede cancelar. En su lugar, cancela la suscripción.",
        );
      }
      if (adhesion.estado === "cancelada") {
        throw new Error("La adhesión ya está cancelada.");
      }

      // Cancelar todos los pagos de adhesión pendientes o vencidos
      await PagoAdhesion.update(
        {
          estado: "cancelado",
          motivo: motivo || "Adhesión cancelada por usuario",
        },
        {
          where: {
            id_adhesion: adhesionId,
            estado: { [Op.in]: ["pendiente", "vencido"] },
          },
          transaction: t,
        },
      );

      // Desactivar suscripción y liberar cupo
      if (adhesion.suscripcion && adhesion.suscripcion.activo) {
        await pagoService.cancelPendingPaymentsBySubscription(
          adhesion.suscripcion.id,
          motivo || "Cancelación de adhesión",
          { transaction: t },
        );
        await adhesion.suscripcion.update(
          { activo: false },
          { transaction: t },
        );
        if (adhesion.proyecto) {
          await adhesion.proyecto.decrement("suscripciones_actuales", {
            by: 1,
            transaction: t,
          });
        } else {
          const proyecto = await Proyecto.findByPk(adhesion.id_proyecto, {
            transaction: t,
          });
          if (proyecto)
            await proyecto.decrement("suscripciones_actuales", {
              by: 1,
              transaction: t,
            });
        }
      }

      await adhesion.update({ estado: "cancelada" }, { transaction: t });

      if (shouldCommit) await t.commit();

      // Notificar por email después del commit
      const notificar = async () => {
        const usuario = await Usuario.findByPk(adhesion.id_usuario);
        const proyecto = await Proyecto.findByPk(adhesion.id_proyecto);
        await emailService.notificarAdhesionCancelada(
          usuario,
          adhesion,
          proyecto,
          motivo,
        );
      };
      if (shouldCommit) {
        await notificar();
      } else if (externalTransaction) {
        externalTransaction.afterCommit(notificar);
      }

      return { message: "Adhesión cancelada exitosamente." };
    } catch (error) {
      if (shouldCommit) await t.rollback();
      throw error;
    }
  },
  /**
   * Verifica si una cuota específica puede ser pagada
   * (todas las cuotas anteriores deben estar pagadas o forzadas)
   * @param {number} adhesionId - ID de la adhesión
   * @param {number} numeroCuota - Número de cuota a pagar (1..N)
   * @param {number|null} usuarioId - Opcional, para verificar pertenencia
   * @returns {Promise<boolean>}
   * @throws {Error} si no es pagable, con mensaje explicativo
   */
  async validarCuotaPagable(adhesionId, numeroCuota, usuarioId = null) {
    const adhesion = await this.obtenerAdhesion(adhesionId, usuarioId);
    if (!adhesion) throw new Error("Adhesión no encontrada");

    const cuota = adhesion.pagos.find((p) => p.numero_cuota === numeroCuota);
    if (!cuota) throw new Error(`Cuota ${numeroCuota} no encontrada`);
    if (!["pendiente", "vencido"].includes(cuota.estado)) {
      throw new Error(
        `La cuota ${numeroCuota} no está pendiente o vencida (estado: ${cuota.estado})`,
      );
    }

    // Buscar cuotas anteriores que NO estén pagadas/forzadas
    const cuotasAnterioresNoPagadas = adhesion.pagos.filter(
      (p) =>
        p.numero_cuota < numeroCuota &&
        !["pagado", "forzado"].includes(p.estado),
    );

    if (cuotasAnterioresNoPagadas.length > 0) {
      const numeros = cuotasAnterioresNoPagadas
        .map((p) => p.numero_cuota)
        .join(", ");
      throw new Error(
        `Debes pagar las cuotas anteriores (${numeros}) antes de pagar la cuota ${numeroCuota}.`,
      );
    }

    return true;
  },
  // ------------------------------------------------------------------
  // FORZAR PAGO DE CUOTA (ADMIN)
  // ------------------------------------------------------------------

  async forzarPagoCuota(adhesionId, numeroCuota, motivo, adminId) {
    const t = await sequelize.transaction();
    try {
      // 1. Bloquear solo la fila de Adhesion (sin includes)
      const adhesionLocked = await Adhesion.findByPk(adhesionId, {
        transaction: t,
        lock: t.LOCK.UPDATE,
        attributes: ["id"],
      });
      if (!adhesionLocked) throw new Error("Adhesión no encontrada");

      // 2. Obtener datos completos con includes (sin lock)
      const adhesion = await Adhesion.findByPk(adhesionId, {
        transaction: t,
        include: [{ model: PagoAdhesion, as: "pagos" }],
      });

      const pagoAdhesion = adhesion.pagos.find(
        (p) => p.numero_cuota === numeroCuota,
      );
      if (!pagoAdhesion) throw new Error(`Cuota ${numeroCuota} no encontrada`);
      if (!["pendiente", "vencido"].includes(pagoAdhesion.estado)) {
        throw new Error(
          `Cuota ${numeroCuota} no está pendiente/vencida (estado: ${pagoAdhesion.estado})`,
        );
      }

      // Validar que cuotas anteriores estén pagadas o forzadas
      const cuotasAnteriores = adhesion.pagos.filter(
        (p) => p.numero_cuota < numeroCuota,
      );
      const algunaPendiente = cuotasAnteriores.some((p) =>
        ["pendiente", "vencido"].includes(p.estado),
      );
      if (algunaPendiente) {
        throw new Error(
          `No se puede forzar pago de cuota ${numeroCuota} porque hay cuotas anteriores pendientes.`,
        );
      }

      const yaPagadas = adhesion.cuotas_pagadas;

      await pagoAdhesion.update(
        {
          estado: "forzado",
          fecha_pago: new Date(),
          motivo: motivo || `Pago forzado por administrador ID ${adminId}`,
        },
        { transaction: t },
      );

      const nuevasPagadas = yaPagadas + 1;
      let nuevoEstado = adhesion.estado;
      let fechaCompletada = null;

      if (nuevasPagadas === adhesion.cuotas_totales) {
        nuevoEstado = "completada";
        fechaCompletada = new Date();
        await this._completarAdhesionYActivarSuscripcion(adhesion, t);
      } else {
        nuevoEstado = "en_curso";
      }

      await adhesion.update(
        {
          cuotas_pagadas: nuevasPagadas,
          estado: nuevoEstado,
          fecha_completada: fechaCompletada,
        },
        { transaction: t },
      );

      await t.commit();

      // Notificaciones
      const usuario = await Usuario.findByPk(adhesion.id_usuario);
      const proyecto = await Proyecto.findByPk(adhesion.id_proyecto);
      await emailService.notificarCuotaAdhesionPagada(
        usuario,
        adhesion,
        pagoAdhesion,
        proyecto,
      );
      if (nuevoEstado === "completada") {
        const suscripcion = await SuscripcionProyecto.findByPk(
          adhesion.id_suscripcion,
        );
        await emailService.notificarAdhesionCompletada(
          usuario,
          adhesion,
          suscripcion,
          proyecto,
        );
      }

      return {
        message: `Cuota ${numeroCuota} marcada como pagada (forzado).`,
        adhesionId: adhesion.id,
        completada: nuevoEstado === "completada",
      };
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },

  // ------------------------------------------------------------------
  // MÉTRICAS Y REPORTES PARA ADMINISTRACIÓN
  // ------------------------------------------------------------------

  /**
   * Obtiene métricas globales de todas las adhesiones
   * @returns {Promise<object>}
   */
  async getAdhesionMetrics() {
    const adhesiones = await Adhesion.findAll({
      include: [{ model: PagoAdhesion, as: "pagos" }],
    });

    let totalAdhesiones = adhesiones.length;
    let totalMontoComprometido = 0;
    let totalPagado = 0;
    let totalPendiente = 0;
    let totalVencido = 0;
    let totalCancelado = 0;
    let adhesionesCompletadas = 0;
    let adhesionesEnCurso = 0;
    let adhesionesPendientes = 0;
    let adhesionesCanceladas = 0;

    for (const adh of adhesiones) {
      totalMontoComprometido += parseFloat(adh.monto_total_adhesion);
      if (adh.estado === "completada") adhesionesCompletadas++;
      else if (adh.estado === "en_curso") adhesionesEnCurso++;
      else if (adh.estado === "pendiente") adhesionesPendientes++;
      else if (adh.estado === "cancelada") adhesionesCanceladas++;

      for (const pago of adh.pagos) {
        const monto = parseFloat(pago.monto);
        if (pago.estado === "pagado" || pago.estado === "forzado") {
          totalPagado += monto;
        } else if (pago.estado === "pendiente") {
          totalPendiente += monto;
        } else if (pago.estado === "vencido") {
          totalVencido += monto;
        } else if (pago.estado === "cancelado") {
          totalCancelado += monto;
        }
      }
    }

    return {
      total_adhesiones: totalAdhesiones,
      estado_resumen: {
        completadas: adhesionesCompletadas,
        en_curso: adhesionesEnCurso,
        pendientes: adhesionesPendientes,
        canceladas: adhesionesCanceladas,
      },
      montos: {
        monto_total_comprometido: totalMontoComprometido.toFixed(2),
        monto_total_pagado: totalPagado.toFixed(2),
        monto_pendiente: totalPendiente.toFixed(2),
        monto_vencido: totalVencido.toFixed(2),
        monto_cancelado: totalCancelado.toFixed(2),
      },
      tasa_cobranza:
        totalMontoComprometido > 0
          ? ((totalPagado / totalMontoComprometido) * 100).toFixed(2)
          : "0.00",
    };
  },

  /**
   * Obtiene el detalle de cuotas vencidas con datos de usuario y proyecto
   */
  async getOverdueAdhesionPayments() {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    return PagoAdhesion.findAll({
      where: {
        estado: "vencido",
        fecha_vencimiento: { [Op.lt]: hoy },
      },
      include: [
        {
          model: Adhesion,
          as: "adhesion",
          include: [
            {
              model: Usuario,
              as: "usuario",
              attributes: ["id", "nombre", "email"],
            },
            {
              model: Proyecto,
              as: "proyecto",
              attributes: ["id", "nombre_proyecto"],
            },
          ],
        },
      ],
      order: [["fecha_vencimiento", "ASC"]],
    });
  },

  /**
   * Obtiene el historial de pagos de una adhesión (para auditoría)
   */
  async getPaymentHistory(adhesionId) {
    const adhesion = await Adhesion.findByPk(adhesionId, {
      include: [
        {
          model: PagoAdhesion,
          as: "pagos",
          order: [["numero_cuota", "ASC"]],
        },
        {
          model: Usuario,
          as: "usuario",
          attributes: ["id", "nombre", "email"],
        },
        {
          model: Proyecto,
          as: "proyecto",
          attributes: ["id", "nombre_proyecto"],
        },
      ],
    });
    if (!adhesion) throw new Error("Adhesión no encontrada");
    return adhesion;
  },

  // ------------------------------------------------------------------
  // LISTAR TODAS LAS ADHESIONES (ADMIN)
  // ------------------------------------------------------------------

  async listarTodasAdhesiones() {
    const UsuarioModel = require("../models/usuario");
    return Adhesion.findAll({
      include: [
        {
          model: UsuarioModel,
          as: "usuario",
          attributes: ["id", "nombre", "apellido", "email", "nombre_usuario"],
        },
        {
          model: Proyecto,
          as: "proyecto",
          attributes: [
            "id",
            "nombre_proyecto",
            "estado_proyecto",
            "tipo_inversion",
          ],
        },
        {
          model: SuscripcionProyecto,
          as: "suscripcion",
          attributes: [
            "id",
            "activo",
            "adhesion_completada",
            "tokens_disponibles",
          ],
        },
        {
          model: PagoAdhesion,
          as: "pagos",
          attributes: [
            "id",
            "numero_cuota",
            "monto",
            "estado",
            "fecha_vencimiento",
            "motivo",
            "fecha_pago",
          ],
          order: [["numero_cuota", "ASC"]],
        },
      ],
      order: [["createdAt", "DESC"]],
    });
  },
};

module.exports = adhesionService;
