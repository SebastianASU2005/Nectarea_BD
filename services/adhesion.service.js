// services/adhesion.service.js
const Adhesion = require("../models/adhesion");
const PagoAdhesion = require("../models/PagoAdhesion");
const SuscripcionProyecto = require("../models/suscripcion_proyecto");
const Proyecto = require("../models/proyecto");
const CuotaMensual = require("../models/CuotaMensual");
const ResumenCuenta = require("../models/resumen_cuenta");
const resumenCuentaService = require("./resumen_cuenta.service");
const { sequelize, Op } = require("../config/database");
const pagoService = require("./pago.service");
const Usuario = require("../models/usuario");
const emailService = require("./email.service");
const auditService = require("../services/audit.service");

const adhesionService = {
  /**
   * Crea una nueva adhesión con plan de pago y reserva el cupo (incrementa suscripciones_actuales).
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

      // 🔒 Bloquear proyecto para operación atómica
      await proyecto.reload({ transaction: t, lock: t.LOCK.UPDATE });

      // 2. Verificar cupo disponible
      if (proyecto.suscripciones_actuales >= proyecto.obj_suscripciones) {
        throw new Error(
          `El proyecto ya alcanzó su límite de ${proyecto.obj_suscripciones} suscriptores.`,
        );
      }

      // 3. Obtener la cuota mensual más reciente
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

      // 4. Crear la SUSCRIPCIÓN
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

      // Reservar cupo
      await proyecto.increment("suscripciones_actuales", {
        by: 1,
        transaction: t,
      });
      await proyecto.reload({ transaction: t });

      // 5. Crear la ADHESIÓN
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

      // 6. Generar pagos de adhesión (día 10 del próximo mes)
      const hoyLocal = new Date();
      let año = hoyLocal.getFullYear();
      let mes = hoyLocal.getMonth() + 1; // próximo mes
      if (mes > 11) {
        mes = 0;
        año++;
      }
      const obtenerFecha10 = (año, mes) => {
        const fecha = new Date(año, mes - 1, 10);
        const y = fecha.getFullYear();
        const m = String(fecha.getMonth() + 1).padStart(2, "0");
        const d = String(fecha.getDate()).padStart(2, "0");
        return `${y}-${m}-${d}`;
      };

      for (let i = 0; i < cuotasTotales; i++) {
        let añoCuota = año;
        let mesCuota = mes + i;
        while (mesCuota > 12) {
          mesCuota -= 12;
          añoCuota++;
        }
        const fechaVencimientoStr = obtenerFecha10(añoCuota, mesCuota);
        await PagoAdhesion.create(
          {
            id_adhesion: adhesion.id,
            numero_cuota: i + 1,
            monto: montoPorCuota,
            fecha_vencimiento: fechaVencimientoStr,
            estado: "pendiente",
          },
          { transaction: t },
        );
      }

      await t.commit();

      // 📧 Notificar al usuario (no interrumpe si falla)
      try {
        const usuario = await Usuario.findByPk(usuarioId);
        const proyectoCompleto = await Proyecto.findByPk(proyectoId);
        await emailService.notificarAdhesionCreada(
          usuario,
          adhesion,
          proyectoCompleto,
          planPago,
        );
      } catch (error) {
        console.error(
          `[crearAdhesion] Error al enviar notificación de adhesión creada (usuario ${usuarioId}):`,
          error.message,
        );
      }

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
   * Procesa el pago de una cuota de adhesión.
   * Valida orden secuencial y, si es el primer pago de la adhesión,
   * verifica si todas las adhesiones del proyecto ya tienen al menos una cuota pagada
   * Y si se alcanzó el cupo total del proyecto. Solo entonces inicia el proyecto.
   */
  async procesarPagoCuota(adhesionId, numeroCuota, transaccionId, t) {
    console.log(
      `[procesarPagoCuota] Iniciando: adhesionId=${adhesionId}, cuota=${numeroCuota}, transaccionId=${transaccionId}`,
    );
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
    const hoyLocalStr = new Date().toLocaleDateString("en-CA");
    await pagoAdhesion.update(
      {
        estado: "pagado",
        fecha_pago: hoyLocalStr,
        id_transaccion: transaccionId,
      },
      { transaction: t },
    );

    const adhesion = adhesionConCuotas;
    const esPrimerPago = adhesion.cuotas_pagadas === 0;
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

    // 🔥 Si fue el primer pago de esta adhesión, verificar si todas las adhesiones del proyecto tienen al menos un pago
    // Y además verificar que el cupo del proyecto esté completo (suscripciones_actuales >= obj_suscripciones)
    if (esPrimerPago) {
      const proyecto = await Proyecto.findByPk(adhesion.id_proyecto, {
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      if (proyecto && proyecto.estado_proyecto === "En Espera") {
        // ✅ NUEVA CONDICIÓN: solo si se alcanzó el objetivo de suscriptores
        if (proyecto.suscripciones_actuales >= proyecto.obj_suscripciones) {
          // Contar adhesiones activas que NO tienen ninguna cuota pagada
          const adhesionesSinPago = await Adhesion.count({
            where: {
              id_proyecto: proyecto.id,
              estado: { [Op.in]: ["pendiente", "en_curso"] },
              cuotas_pagadas: 0,
            },
            transaction: t,
          });
          if (adhesionesSinPago === 0) {
            console.log(
              `[adhesionService] Cupo completo (${proyecto.suscripciones_actuales}/${proyecto.obj_suscripciones}) y todas las adhesiones tienen al menos un pago. Iniciando proyecto automáticamente...`,
            );
            const proyectoService = require("./proyecto.service");
            await proyectoService.iniciarConteoMensual(proyecto.id, {
              sistema: true,
              transaction: t,
            });
          } else {
            console.log(
              `[adhesionService] Cupo completo pero aún hay ${adhesionesSinPago} adhesiones sin pagos. No se inicia el proyecto.`,
            );
          }
        } else {
          console.log(
            `[adhesionService] No se alcanzó el cupo (${proyecto.suscripciones_actuales}/${proyecto.obj_suscripciones}). Proyecto no iniciado.`,
          );
        }
      }
    }

    // Notificar por email después del commit
    // 🔥 Notificación (después del commit, no interrumpe)
    t.afterCommit(async () => {
      try {
        const usuario = await Usuario.findByPk(adhesion.id_usuario);
        const proyecto = await Proyecto.findByPk(adhesion.id_proyecto);
        await emailService.notificarCuotaAdhesionPagada(
          usuario,
          adhesion,
          pagoAdhesion,
          proyecto,
        );
      } catch (error) {
        console.error(
          `[procesarPagoCuota] Error al notificar pago de cuota:`,
          error.message,
        );
      }
    });
  },
  /**
   * Cuando se completa la última cuota, activa la suscripción (token = 1, adhesion_completada = true)
   * y crea el resumen de cuenta si no existe.
   * NOTA: No modifica suscripciones_actuales (ya fue reservado al crear la adhesión).
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
    if (suscripcion.adhesion_completada) return;

    await suscripcion.update(
      {
        tokens_disponibles: 1,
        adhesion_completada: true,
      },
      { transaction },
    );

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

    transaction.afterCommit(async () => {
      try {
        const usuario = await Usuario.findByPk(adhesion.id_usuario);
        const proyectoCompleto = await Proyecto.findByPk(adhesion.id_proyecto);
        await emailService.notificarAdhesionCompletada(
          usuario,
          adhesion,
          suscripcion,
          proyectoCompleto,
        );
      } catch (error) {
        console.error(
          `[_completarAdhesionYActivarSuscripcion] Error al notificar adhesión completada:`,
          error.message,
        );
      }
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
    ip = null,
    userAgent = null,
  ) {
    const t = externalTransaction || (await sequelize.transaction());
    const shouldCommit = !externalTransaction;
    try {
      const adhesionLocked = await Adhesion.findByPk(adhesionId, {
        transaction: t,
        lock: t.LOCK.UPDATE,
        attributes: ["id"],
      });
      if (!adhesionLocked) throw new Error("Adhesión no encontrada.");

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

      // Cancelar pagos pendientes/vencidos de esta adhesión
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

      // Desactivar la suscripción asociada y liberar cupo
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

        // ✅ Siempre liberar el cupo
        const proyecto = await Proyecto.findByPk(adhesion.id_proyecto, {
          transaction: t,
          lock: t.LOCK.UPDATE,
        });
        if (proyecto) {
          await proyecto.decrement("suscripciones_actuales", {
            by: 1,
            transaction: t,
          });
        }

        // Eliminar favoritos si es la última suscripción activa del usuario en este proyecto
        const otrasActivas = await SuscripcionProyecto.count({
          where: {
            id_usuario: adhesion.id_usuario,
            id_proyecto: adhesion.id_proyecto,
            activo: true,
          },
          transaction: t,
        });
        if (otrasActivas === 0) {
          const favoritoService = require("./favorito.service");
          const eliminados =
            await favoritoService.eliminarFavoritosPorUsuarioYProyecto(
              adhesion.id_usuario,
              adhesion.id_proyecto,
              t,
            );
          if (eliminados > 0) {
            console.log(
              `[cancelarAdhesion] Se eliminaron ${eliminados} favoritos del usuario ${adhesion.id_usuario} para el proyecto ${adhesion.id_proyecto}`,
            );
          }
        }
      }

      const datosPrevios = {
        estado: adhesion.estado,
        cuotas_pagadas: adhesion.cuotas_pagadas,
      };
      await adhesion.update({ estado: "cancelada" }, { transaction: t });

      if (esAdmin && userId) {
        await auditService.registrar({
          usuarioId: userId,
          accion: "CANCELAR_ADHESION",
          entidadTipo: "Adhesion",
          entidadId: adhesion.id,
          datosPrevios,
          datosNuevos: { estado: "cancelada" },
          motivo: motivo || "Cancelación por administrador",
          ip,
          userAgent,
          transaccion: t,
        });
      }

      if (shouldCommit) await t.commit();

      // 📧 Notificaciones (sin interrumpir)
      if (shouldCommit) {
        try {
          const usuario = await Usuario.findByPk(adhesion.id_usuario);
          const proyecto = await Proyecto.findByPk(adhesion.id_proyecto);
          await emailService.notificarAdhesionCancelada(
            usuario,
            adhesion,
            proyecto,
            motivo,
          );
        } catch (error) {
          console.error(
            `[cancelarAdhesion] Error al notificar cancelación:`,
            error.message,
          );
        }
      } else if (externalTransaction) {
        externalTransaction.afterCommit(async () => {
          try {
            const usuario = await Usuario.findByPk(adhesion.id_usuario);
            const proyecto = await Proyecto.findByPk(adhesion.id_proyecto);
            await emailService.notificarAdhesionCancelada(
              usuario,
              adhesion,
              proyecto,
              motivo,
            );
          } catch (error) {
            console.error(
              `[cancelarAdhesion] Error al notificar cancelación (afterCommit):`,
              error.message,
            );
          }
        });
      }

      return { message: "Adhesión cancelada exitosamente." };
    } catch (error) {
      if (shouldCommit) await t.rollback();
      throw error;
    }
  },

  /**
   * Verifica si una cuota específica puede ser pagada
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
  async forzarPagoCuota(
    adhesionId,
    numeroCuota,
    motivo,
    adminId,
    ip = null,
    userAgent = null,
  ) {
    const t = await sequelize.transaction();

    try {
      const adhesionLocked = await Adhesion.findByPk(adhesionId, {
        transaction: t,
        lock: t.LOCK.UPDATE,
        attributes: ["id"],
      });
      if (!adhesionLocked) throw new Error("Adhesión no encontrada");

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
      const datosPrevios = pagoAdhesion.toJSON();

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

      await auditService.registrar({
        usuarioId: adminId,
        accion: "FORZAR_PAGO_CUOTA_ADHESION",
        entidadTipo: "PagoAdhesion",
        entidadId: pagoAdhesion.id,
        datosPrevios,
        datosNuevos: pagoAdhesion.toJSON(),
        motivo,
        ip,
        userAgent,
        transaccion: t,
      });

      // ✅ Notificación del pago de la cuota — DESPUÉS del commit
      // (el email de "adhesión completada", si aplica, lo dispara
      //  _completarAdhesionYActivarSuscripcion en su propio afterCommit)
      t.afterCommit(async () => {
        try {
          const adhesionFresca = await Adhesion.findByPk(adhesion.id);
          const usuario = await Usuario.findByPk(adhesion.id_usuario);
          const proyecto = await Proyecto.findByPk(adhesion.id_proyecto);
          const pagoFresco = await PagoAdhesion.findOne({
            where: {
              id_adhesion: adhesion.id,
              numero_cuota: pagoAdhesion.numero_cuota,
            },
          });

          await emailService.notificarCuotaAdhesionPagada(
            usuario,
            adhesionFresca,
            pagoFresco,
            proyecto,
          );
        } catch (error) {
          console.error(
            `[forzarPagoCuota] Error al enviar notificaciones (post-commit):`,
            error.message,
          );
        }
      });

      await t.commit();

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

  async getAdhesionMetrics(fechaInicio = null, fechaFin = null) {
    const whereAdhesion = {};
    if (fechaInicio) whereAdhesion.createdAt = { [Op.gte]: fechaInicio };
    if (fechaFin)
      whereAdhesion.createdAt = {
        ...whereAdhesion.createdAt,
        [Op.lte]: fechaFin,
      };

    const adhesiones = await Adhesion.findAll({
      where: whereAdhesion,
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

    const tasaCobranza =
      totalMontoComprometido > 0
        ? ((totalPagado / totalMontoComprometido) * 100).toFixed(2)
        : "0.00";

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
      tasa_cobranza: tasaCobranza,
    };
  },

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
