// Archivo: services/suscripcion_proyecto.service.js
// VERSIÓN SIN FLUJO ANTIGUO DE PRIMER PAGO (pago_suscripcion_inicial)

const SuscripcionProyecto = require("../models/suscripcion_proyecto");
const Usuario = require("../models/usuario");
const Proyecto = require("../models/proyecto");
const CuotaMensual = require("../models/CuotaMensual");
const Pago = require("../models/pago");
const SuscripcionCancelada = require("../models/suscripcion_cancelada");
const MensajeService = require("./mensaje.service");
const UsuarioService = require("./usuario.service");
const { sequelize, Op } = require("../config/database");
const resumenCuentaService = require("./resumen_cuenta.service");
const emailService = require("./email.service");
const auditService = require("../services/audit.service");

const suscripcionProyectoService = {
  // =========================================================================
  // FUNCIONES DE CONSULTA
  // =========================================================================

  async findUsersByProjectId(projectId) {
    const suscripciones = await SuscripcionProyecto.findAll({
      where: {
        id_proyecto: projectId,
        activo: true,
      },
      include: [
        {
          model: Usuario,
          as: "usuario",
          where: { activo: true },
          attributes: ["id", "nombre", "apellido", "email", "nombre_usuario"],
        },
      ],
    });
    return suscripciones.map((suscripcion) => suscripcion.usuario);
  },

  async findById(id) {
    return SuscripcionProyecto.findByPk(id, {
      include: [
        {
          model: Usuario,
          as: "usuario",
          attributes: ["id", "nombre", "apellido", "email", "nombre_usuario"],
        },
        {
          model: Proyecto,
          as: "proyectoAsociado",
          attributes: [
            "id",
            "nombre_proyecto",
            "tipo_inversion",
            "estado_proyecto",
            "plazo_inversion",
            "obj_suscripciones",
            "suscripciones_actuales",
          ],
        },
      ],
    });
  },

  async findByIdAndUserId(id, userId) {
    return SuscripcionProyecto.findOne({
      where: {
        id,
        id_usuario: userId,
        activo: true,
      },
      include: [
        {
          model: Usuario,
          as: "usuario",
          attributes: ["id", "nombre", "apellido", "email", "nombre_usuario"],
        },
        {
          model: Proyecto,
          as: "proyectoAsociado",
          attributes: [
            "id",
            "nombre_proyecto",
            "tipo_inversion",
            "estado_proyecto",
            "plazo_inversion",
            "obj_suscripciones",
            "suscripciones_actuales",
          ],
        },
      ],
    });
  },

  async findByUserAndProjectId(userId, projectId) {
    return SuscripcionProyecto.findOne({
      where: {
        id_usuario: userId,
        id_proyecto: projectId,
        activo: true,
      },
      include: [
        {
          model: Usuario,
          as: "usuario",
          attributes: ["id", "nombre", "apellido", "email", "nombre_usuario"],
        },
        {
          model: Proyecto,
          as: "proyectoAsociado",
          attributes: [
            "id",
            "nombre_proyecto",
            "tipo_inversion",
            "estado_proyecto",
            "plazo_inversion",
            "obj_suscripciones",
            "suscripciones_actuales",
          ],
        },
      ],
    });
  },

  async findAll() {
    return SuscripcionProyecto.findAll({
      include: [
        {
          model: Usuario,
          as: "usuario",
          attributes: ["id", "nombre", "apellido", "email", "nombre_usuario"],
        },
        {
          model: Proyecto,
          as: "proyectoAsociado",
          attributes: [
            "id",
            "nombre_proyecto",
            "tipo_inversion",
            "estado_proyecto",
            "plazo_inversion",
            "obj_suscripciones",
            "suscripciones_actuales",
          ],
        },
      ],
      order: [["id", "DESC"]],
    });
  },

  async findAllActivo() {
    return SuscripcionProyecto.findAll({
      where: { activo: true },
      include: [
        {
          model: Proyecto,
          as: "proyectoAsociado",
          attributes: [
            "id",
            "nombre_proyecto",
            "tipo_inversion",
            "estado_proyecto",
            "plazo_inversion",
            "obj_suscripciones",
            "suscripciones_actuales",
          ],
        },
        {
          model: Usuario,
          as: "usuario",
          attributes: ["id", "nombre", "apellido", "email", "nombre_usuario"],
        },
      ],
      order: [["id", "DESC"]],
    });
  },

  async findByUserId(userId) {
    return SuscripcionProyecto.findAll({
      where: { id_usuario: userId, activo: true },
      include: [
        {
          model: Proyecto,
          as: "proyectoAsociado",
          where: { activo: true },
          attributes: [
            "id",
            "nombre_proyecto",
            "tipo_inversion",
            "estado_proyecto",
            "plazo_inversion",
            "obj_suscripciones",
            "suscripciones_actuales",
          ],
        },
        {
          model: Usuario,
          as: "usuario",
          attributes: ["id", "nombre", "apellido", "email", "nombre_usuario"],
        },
      ],
      order: [["id", "DESC"]],
    });
  },

  async update(id, data) {
    const suscripcion = await this.findById(id);
    if (!suscripcion) return null;
    return suscripcion.update(data);
  },

  // =========================================================================
  // CANCELACIÓN DE SUSCRIPCIÓN (con o sin adhesión)
  // =========================================================================

  async softDelete(
    suscripcionId,
    usuarioAutenticado,
    ip = null,
    userAgent = null,
  ) {
    const t = await sequelize.transaction();
    try {
      const pujaService = require("./puja.service");
      const pagoService = require("./pago.service");
      const loteService = require("./lote.service");

      const suscripcion = await SuscripcionProyecto.findByPk(suscripcionId, {
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      if (!suscripcion) throw new Error("Suscripción no encontrada.");
      if (!suscripcion.activo)
        throw new Error("La suscripción ya ha sido cancelada.");

      const esAdministrador = usuarioAutenticado?.rol === "admin";
      if (
        suscripcion.id_usuario !== usuarioAutenticado.id &&
        !esAdministrador
      ) {
        throw new Error(
          "Acceso denegado. La suscripción no te pertenece y no tienes permisos de administrador.",
        );
      }

      // Verificar si existe una adhesión asociada y no está completada
      const Adhesion = require("../models/adhesion");
      const adhesion = await Adhesion.findOne({
        where: { id_suscripcion: suscripcionId },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      if (adhesion && adhesion.estado !== "completada") {
        const adhesionService = require("./adhesion.service");
        await adhesionService.cancelarAdhesion(
          adhesion.id,
          usuarioAutenticado.id,
          esAdministrador,
          "Cancelación de suscripción antes de completar adhesión",
          t,
          ip,
          userAgent,
        );
        await t.commit();
        return suscripcion;
      }

      // Validar que no tenga pujas ganadas y pagadas
      const hasPaidBid = await pujaService.hasWonAndPaidBid(
        suscripcion.id_usuario,
        suscripcion.id_proyecto,
        { transaction: t },
      );
      if (hasPaidBid) {
        throw new Error(
          "❌ No se puede cancelar la suscripción. El usuario ha ganado y pagado una puja en este proyecto.",
        );
      }

      // Verificar si tiene una puja ganadora PENDIENTE de pago
      const Lote = require("../models/lote");
      const lotesDelProyecto = await Lote.findAll({
        where: { id_proyecto: suscripcion.id_proyecto },
        attributes: ["id"],
        transaction: t,
      });
      const loteIds = lotesDelProyecto.map((l) => l.id);
      let pujaPendiente = null;
      if (loteIds.length > 0) {
        pujaPendiente = await pujaService.findOne({
          where: {
            id_usuario: suscripcion.id_usuario,
            id_lote: { [Op.in]: loteIds },
            estado_puja: "ganadora_pendiente",
          },
          transaction: t,
        });
      }

      if (pujaPendiente) {
        await pujaPendiente.update(
          {
            estado_puja: "ganadora_incumplimiento",
            fecha_vencimiento_pago: null,
          },
          { transaction: t },
        );
        await loteService.procesarImpagoLote(pujaPendiente.id_lote, t);
      }

      // Cancelar todos los pagos pendientes o vencidos
      const pagosCancelados =
        await pagoService.cancelPendingPaymentsBySubscription(
          suscripcion.id,
          "Cancelación de suscripción",
          { transaction: t },
        );

      const pagosRealizados = await Pago.findAll({
        where: {
          id_suscripcion: suscripcion.id,
          estado_pago: { [Op.in]: ["pagado", "cubierto_por_puja", "forzado"] },
        },
        transaction: t,
      });
      const montoTotalPagado = pagosRealizados.reduce(
        (sum, pago) => sum + parseFloat(pago.monto),
        0,
      );

      const datosPreviosSuscripcion = suscripcion.toJSON();
      await suscripcion.update({ activo: false }, { transaction: t });
      const otrasActivas = await SuscripcionProyecto.count({
        where: {
          id_usuario: suscripcion.id_usuario,
          id_proyecto: suscripcion.id_proyecto,
          activo: true,
        },
        transaction: t,
      });
      if (otrasActivas === 0) {
        const favoritoService = require("./favorito.service");
        const eliminados =
          await favoritoService.eliminarFavoritosPorUsuarioYProyecto(
            suscripcion.id_usuario,
            suscripcion.id_proyecto,
            t,
          );
        if (eliminados > 0) {
          console.log(
            `[softDelete] Se eliminaron ${eliminados} favoritos del usuario ${suscripcion.id_usuario} para el proyecto ${suscripcion.id_proyecto}`,
          );
        }
      }
      const proyecto = await Proyecto.findByPk(suscripcion.id_proyecto, {
        transaction: t,
      });
      if (proyecto) {
        await proyecto.decrement("suscripciones_actuales", {
          by: 1,
          transaction: t,
        });
      }

      const registroCancelacion = await SuscripcionCancelada.create(
        {
          id_suscripcion_original: suscripcion.id,
          id_usuario: suscripcion.id_usuario,
          id_proyecto: suscripcion.id_proyecto,
          meses_pagados: pagosRealizados.length,
          monto_pagado_total: montoTotalPagado,
          fecha_cancelacion: new Date(),
          pagos_cancelados: pagosCancelados,
        },
        { transaction: t },
      );

      await resumenCuentaService.registrarEventoCancelacion(
        {
          id_usuario: suscripcion.id_usuario,
          descripcion: `Suscripción ${suscripcion.id} al Proyecto ${suscripcion.id_proyecto} cancelada. 
        Pagos realizados: ${pagosRealizados.length} ($${montoTotalPagado.toFixed(2)})
        Pagos cancelados: ${pagosCancelados}
        ${pujaPendiente ? `Puja ganadora #${pujaPendiente.id} cancelada y lote reasignado.` : ""}
        Motivo: Cancelación voluntaria.`,
          monto: montoTotalPagado,
          referencia_id: registroCancelacion.id,
        },
        t,
      );

      if (esAdministrador) {
        await auditService.registrar({
          usuarioId: usuarioAutenticado.id,
          accion: "CANCELAR_SUSCRIPCION_ADMIN",
          entidadTipo: "SuscripcionProyecto",
          entidadId: suscripcion.id,
          datosPrevios: datosPreviosSuscripcion,
          datosNuevos: { activo: false },
          motivo: "Cancelación por administrador",
          ip: ip,
          userAgent: userAgent,
          transaccion: t,
        });
      }

      await t.commit();

      this._sendCancellationNotifications(suscripcion, proyecto, {
        pagosCancelados,
        pagosRealizados: pagosRealizados.length,
        montoTotalPagado,
      });

      if (pujaPendiente) {
        setImmediate(async () => {
          try {
            const usuario = await UsuarioService.findById(
              suscripcion.id_usuario,
            );
            if (usuario) {
              await emailService.notificarImpago(
                usuario,
                pujaPendiente.id_lote,
              );
              await MensajeService.crear({
                id_remitente: 1,
                id_receptor: usuario.id,
                contenido: `Tu puja ganadora en el Lote #${pujaPendiente.id_lote} fue cancelada automáticamente al dar de baja tu suscripción al proyecto.`,
              });
            }
          } catch (err) {
            console.error(err.message);
          }
        });
      }

      return suscripcion;
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },

  async _sendCancellationNotifications(suscripcion, proyecto, metrics) {
    try {
      const usuario = await UsuarioService.findById(suscripcion.id_usuario);
      if (!usuario?.email) return;

      await emailService.notificarCancelacionSuscripcion(
        usuario.email,
        proyecto,
        {
          pagos_cancelados: metrics.pagosCancelados,
          pagos_realizados: metrics.pagosRealizados,
          monto_total_pagado: metrics.montoTotalPagado,
        },
      );

      const contenido = `Tu suscripción al proyecto "${proyecto.nombre_proyecto}" ha sido cancelada exitosamente. 
    Pagos realizados: ${metrics.pagosRealizados} ($${metrics.montoTotalPagado.toFixed(2)})
    Pagos pendientes cancelados: ${metrics.pagosCancelados}`;

      await MensajeService.crear({
        id_remitente: 1,
        id_receptor: usuario.id,
        contenido: contenido,
      });
    } catch (error) {
      console.error(error.message);
    }
  },

  async findAllCanceladas() {
    return SuscripcionCancelada.findAll({
      include: [
        {
          model: Usuario,
          as: "usuarioCancelador",
          attributes: ["id", "nombre", "apellido", "email", "nombre_usuario"],
        },
        {
          model: Proyecto,
          as: "proyectoCancelado",
          attributes: [
            "id",
            "nombre_proyecto",
            "tipo_inversion",
            "estado_proyecto",
          ],
        },
        {
          model: SuscripcionProyecto,
          as: "suscripcionOriginal",
          attributes: [
            "id",
            "id_usuario",
            "id_proyecto",
            "monto_total_pagado",
            "activo",
          ],
        },
      ],
      order: [["fecha_cancelacion", "DESC"]],
    });
  },

  async findActiveByProjectId(projectId, t) {
    return SuscripcionProyecto.findAll({
      where: {
        id_proyecto: projectId,
        activo: true,
      },
      include: [
        {
          model: Usuario,
          as: "usuario",
          attributes: ["id", "nombre", "apellido", "email", "nombre_usuario"],
        },
        {
          model: Proyecto,
          as: "proyectoAsociado",
          attributes: [
            "id",
            "nombre_proyecto",
            "tipo_inversion",
            "estado_proyecto",
            "plazo_inversion",
          ],
        },
      ],
      transaction: t,
    });
  },

  async findAllByProjectId(projectId, t) {
    return SuscripcionProyecto.findAll({
      where: {
        id_proyecto: projectId,
      },
      include: [
        {
          model: Usuario,
          as: "usuario",
          attributes: ["id", "nombre", "apellido", "email", "nombre_usuario"],
        },
        {
          model: Proyecto,
          as: "proyectoAsociado",
          attributes: [
            "id",
            "nombre_proyecto",
            "tipo_inversion",
            "estado_proyecto",
            "plazo_inversion",
          ],
        },
      ],
      transaction: t,
    });
  },

  async findMyCanceladas(userId) {
    return SuscripcionCancelada.findAll({
      where: {
        id_usuario: userId,
      },
      include: [
        {
          model: Usuario,
          as: "usuarioCancelador",
          attributes: ["id", "nombre", "apellido", "email", "nombre_usuario"],
        },
        {
          model: Proyecto,
          as: "proyectoCancelado",
          attributes: [
            "id",
            "nombre_proyecto",
            "tipo_inversion",
            "estado_proyecto",
          ],
        },
        {
          model: SuscripcionProyecto,
          as: "suscripcionOriginal",
          attributes: [
            "id",
            "id_usuario",
            "id_proyecto",
            "monto_total_pagado",
            "activo",
          ],
        },
      ],
      order: [["fecha_cancelacion", "DESC"]],
    });
  },

  async findByProjectCanceladas(projectId) {
    return SuscripcionCancelada.findAll({
      where: {
        id_proyecto: projectId,
      },
      include: [
        {
          model: Usuario,
          as: "usuarioCancelador",
          attributes: ["id", "nombre", "apellido", "email", "nombre_usuario"],
        },
        {
          model: Proyecto,
          as: "proyectoCancelado",
          attributes: [
            "id",
            "nombre_proyecto",
            "tipo_inversion",
            "estado_proyecto",
          ],
        },
        {
          model: SuscripcionProyecto,
          as: "suscripcionOriginal",
          attributes: [
            "id",
            "id_usuario",
            "id_proyecto",
            "monto_total_pagado",
            "activo",
          ],
        },
      ],
      order: [["fecha_cancelacion", "DESC"]],
    });
  },

  async marcarDevolucion(cancelacionId) {
    const registro = await SuscripcionCancelada.findByPk(cancelacionId);
    if (!registro) throw new Error("Registro de cancelación no encontrado.");
    if (registro.devolucion_realizada)
      throw new Error("La devolución ya fue registrada anteriormente.");
    return await registro.update({
      devolucion_realizada: true,
      fecha_devolucion: new Date(),
    });
  },

  // =========================================================================
  // MÉTRICAS Y REPORTES
  // =========================================================================

  async getMorosityMetrics(fechaInicio = null, fechaFin = null) {
    const wherePagos = {};
    if (fechaInicio) wherePagos.createdAt = { [Op.gte]: fechaInicio };
    if (fechaFin)
      wherePagos.createdAt = { ...wherePagos.createdAt, [Op.lte]: fechaFin };

    const totalGeneradoResult = await Pago.sum("monto", {
      where: {
        ...wherePagos,
        estado_pago: {
          [Op.in]: [
            "pagado",
            "pendiente",
            "vencido",
            "cubierto_por_puja",
            "cancelado",
            "forzado",
          ],
        },
      },
    });
    const totalGenerado = Number(totalGeneradoResult) || 0;

    const totalEnRiesgoResult = await Pago.sum("monto", {
      where: {
        ...wherePagos,
        estado_pago: { [Op.in]: ["pendiente", "vencido"] },
      },
    });
    const totalEnRiesgo = Number(totalEnRiesgoResult) || 0;

    const tasaMorosidad =
      totalGenerado > 0 ? (totalEnRiesgo / totalGenerado) * 100 : 0;

    return {
      total_pagos_generados: totalGenerado.toFixed(2),
      total_en_riesgo: totalEnRiesgo.toFixed(2),
      tasa_morosidad: tasaMorosidad.toFixed(2),
    };
  },

  async getCancellationRate(fechaInicio = null, fechaFin = null) {
    const totalSuscripciones = await SuscripcionProyecto.count();
    if (totalSuscripciones === 0) {
      return {
        total_suscripciones: 0,
        total_canceladas: 0,
        tasa_cancelacion: 0.0,
      };
    }

    const whereCancel = {};
    if (fechaInicio) whereCancel.fecha_cancelacion = { [Op.gte]: fechaInicio };
    if (fechaFin)
      whereCancel.fecha_cancelacion = {
        ...whereCancel.fecha_cancelacion,
        [Op.lte]: fechaFin,
      };

    const totalCanceladas = await SuscripcionCancelada.count({
      where: whereCancel,
    });

    const tasaCancelacion = (totalCanceladas / totalSuscripciones) * 100;

    return {
      total_suscripciones: totalSuscripciones,
      total_canceladas: totalCanceladas,
      tasa_cancelacion: tasaCancelacion.toFixed(2),
    };
  },

  // =========================================================================
  // STANDBY
  // =========================================================================

  async activateStandby(suscripcionId, usuarioAutenticado) {
    const t = await sequelize.transaction();
    try {
      const suscripcion = await SuscripcionProyecto.findByPk(suscripcionId, {
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      if (!suscripcion) throw new Error("Suscripción no encontrada.");
      if (!suscripcion.activo)
        throw new Error("La suscripción ya está cancelada.");
      if (suscripcion.standby_active)
        throw new Error("La suscripción ya se encuentra en período de pausa.");

      const esAdmin = usuarioAutenticado?.rol === "admin";
      if (suscripcion.id_usuario !== usuarioAutenticado.id && !esAdmin) {
        throw new Error("No tienes permiso para pausar esta suscripción.");
      }

      const proyecto = await Proyecto.findByPk(suscripcion.id_proyecto, {
        transaction: t,
      });
      if (!proyecto || proyecto.estado_proyecto !== "En proceso") {
        throw new Error(
          "No se puede pausar la suscripción porque el proyecto no está en proceso.",
        );
      }

      const hoy = new Date();
      const endDate = new Date(hoy);
      endDate.setMonth(hoy.getMonth() + 6);
      endDate.setHours(0, 0, 0, 0);

      await suscripcion.update(
        {
          standby_active: true,
          standby_end_date: endDate,
        },
        { transaction: t },
      );

      await t.commit();

      const usuario = await Usuario.findByPk(suscripcion.id_usuario);
      if (usuario) {
        try {
          await emailService.notificarStandbyActivado(
            usuario,
            proyecto,
            endDate,
          );
        } catch (emailError) {
          console.error(emailError.message);
        }
      }

      return suscripcion;
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },

  async deactivateStandby(suscripcionId, usuarioAutenticado) {
    const t = await sequelize.transaction();
    try {
      const suscripcion = await SuscripcionProyecto.findByPk(suscripcionId, {
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      if (!suscripcion) throw new Error("Suscripción no encontrada.");
      if (!suscripcion.standby_active)
        throw new Error("La suscripción no está en período de pausa.");

      const esAdmin = usuarioAutenticado?.rol === "admin";
      if (suscripcion.id_usuario !== usuarioAutenticado.id && !esAdmin) {
        throw new Error("No tienes permiso para reactivar esta suscripción.");
      }

      await suscripcion.update(
        {
          standby_active: false,
          standby_end_date: null,
        },
        { transaction: t },
      );

      await t.commit();
      return suscripcion;
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },
};

module.exports = suscripcionProyectoService;
