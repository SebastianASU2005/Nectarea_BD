// Archivo: services/suscripcion_proyecto.service.js

// Importar los modelos y servicios necesarios
const SuscripcionProyecto = require("../models/suscripcion_proyecto");
const Usuario = require("../models/usuario");
const Proyecto = require("../models/proyecto");
const CuotaMensual = require("../models/CuotaMensual");
const Pago = require("../models/pago");
const SuscripcionCancelada = require("../models/suscripcion_cancelada");
const MensajeService = require("./mensaje.service");
const UsuarioService = require("./usuario.service");
const Transaccion = require("../models/transaccion");
const { sequelize, Op } = require("../config/database");
const resumenCuentaService = require("./resumen_cuenta.service");
const emailService = require("./email.service");

/**
 * Servicio de lógica de negocio para la gestión de Suscripciones a Proyectos (SuscripcionProyecto).
 */
const suscripcionProyectoService = {
  /**
   * @async
   * @private
   * @function _createSubscriptionRecord
   * @description Crea el registro inicial de la suscripción en la BD y actualiza el contador del proyecto.
   * Se invoca tras la confirmación del primer pago.
   * @param {Object} data - Datos para la creación de la suscripción (id_usuario, id_proyecto, monto_suscripcion, etc.).
   * @param {Object} t - Transacción de Sequelize activa.
   * @returns {Promise<{nuevaSuscripcion: SuscripcionProyecto, proyecto: Proyecto}>}
   * @throws {Error} Si el proyecto no existe, está cerrado, o ya alcanzó su capacidad máxima.
   */
  async _createSubscriptionRecord(data, t) {
    const usuario = await require("./usuario.service").findById(
      data.id_usuario,
    );
    if (usuario && usuario.rol === "admin") {
      throw new Error(
        "⛔ Los administradores no pueden crear suscripciones como clientes.",
      );
    }
    const proyecto = await Proyecto.findByPk(data.id_proyecto, {
      transaction: t,
    });
    if (!proyecto) {
      throw new Error("Proyecto asociado no encontrado.");
    }

    if (
      proyecto.estado_proyecto === "Finalizado" ||
      proyecto.estado_proyecto === "Cancelado"
    ) {
      throw new Error(
        `❌ No se puede iniciar una suscripción, el proyecto "${proyecto.nombre_proyecto}" está en estado: ${proyecto.estado_proyecto}.`,
      );
    }

    if (proyecto.suscripciones_actuales >= proyecto.obj_suscripciones) {
      throw new Error(
        `❌ El proyecto "${proyecto.nombre_proyecto}" ya ha alcanzado su límite máximo de ${proyecto.obj_suscripciones} suscriptores.`,
      );
    }

    data.meses_a_pagar = proyecto.plazo_inversion;

    const nuevaSuscripcion = await SuscripcionProyecto.create(data, {
      transaction: t,
    });

    await proyecto.increment("suscripciones_actuales", {
      by: 1,
      transaction: t,
    });
    await proyecto.reload({ transaction: t });

    if (
      proyecto.suscripciones_actuales >= proyecto.obj_suscripciones &&
      !proyecto.objetivo_notificado
    ) {
      await proyecto.update(
        {
          objetivo_notificado: true,
          estado_proyecto: "En proceso",
          fecha_inicio_proceso: new Date(),
          meses_restantes: proyecto.plazo_inversion,
        },
        { transaction: t },
      );

      const todosLosUsuarios = await Usuario.findAll({
        where: { activo: true },
        transaction: t,
      });

      const remitente_id = 1;
      const contenido = `¡Objetivo alcanzado! El proyecto "${proyecto.nombre_proyecto}" ha alcanzado el número de suscripciones necesarias y ahora está en proceso.`;

      for (const usuario of todosLosUsuarios) {
        if (usuario.id !== remitente_id) {
          await MensajeService.crear(
            {
              id_remitente: remitente_id,
              id_receptor: usuario.id,
              contenido: contenido,
            },
            { transaction: t },
          );
        }
      }

      try {
        await emailService.notificarInicioProyectoMasivo(
          proyecto,
          todosLosUsuarios,
        );
      } catch (error) {
        console.error(
          `Error al enviar emails masivos de inicio de proyecto ${proyecto.nombre_proyecto}:`,
          error.message,
        );
      }

      try {
        const admins = await UsuarioService.findAllAdmins();
        if (admins && admins.length > 0) {
          const adminPrincipal = admins[0];
          if (adminPrincipal.email) {
            await emailService.notificarInicioProyectoAdmin(
              adminPrincipal.email,
              proyecto,
            );
          }
        } else {
          console.warn(
            "No se encontraron administradores para notificar el inicio del proyecto.",
          );
        }
      } catch (error) {
        console.error(
          `Error al enviar email de inicio de proyecto al administrador ${proyecto.nombre_proyecto}:`,
          error.message,
        );
      }
    }

    return { nuevaSuscripcion, proyecto };
  },

  // -------------------------------------------------------------------
  // 🚀 FUNCIÓN CLAVE: CONFIRMACIÓN DE SUSCRIPCIÓN TRAS PAGO EXITOSO
  // -------------------------------------------------------------------

  /**
   * @async
   * @function confirmarSuscripcion
   * @description Procesa la confirmación final de la suscripción después de un pago exitoso.
   * Se encarga de actualizar el estado del pago/transacción y crear el registro final de la suscripción.
   * @param {number} transaccionId - ID de la Transacción que acaba de ser pagada.
   * @returns {Promise<SuscripcionProyecto>} La nueva instancia de SuscripcionProyecto.
   * @throws {Error} Si la transacción no es válida o ya fue procesada.
   */
  async confirmarSuscripcion(transaccionId) {
    const t = await sequelize.transaction();
    try {
      const transaccion = await Transaccion.findByPk(transaccionId, {
        transaction: t,
      });

      if (!transaccion) {
        throw new Error(`Transacción con ID ${transaccionId} no encontrada.`);
      }

      if (transaccion.estado_transaccion !== "pendiente") {
        throw new Error(
          `❌ La Transacción ${transaccionId} ya fue procesada o está en estado no elegible: ${transaccion.estado_transaccion}.`,
        );
      }

      const pago = await Pago.findByPk(transaccion.id_pago_mensual, {
        transaction: t,
      });

      if (!pago) {
        throw new Error(
          `Pago mensual asociado a la transacción ${transaccionId} no encontrado.`,
        );
      }

      const { nuevaSuscripcion, proyecto } =
        await this._createSubscriptionRecord(
          {
            id_usuario: transaccion.id_usuario,
            id_proyecto: transaccion.id_proyecto,
            monto_total_pagado: transaccion.monto,
          },
          t,
        );

      await pago.update(
        {
          id_suscripcion: nuevaSuscripcion.id,
          estado_pago: "pagado",
        },
        { transaction: t },
      );

      await transaccion.update(
        { estado_transaccion: "pagado", fecha_pago: new Date() },
        { transaction: t },
      );

      if (proyecto.tipo_inversion === "mensual") {
        const cuotaMensual = await CuotaMensual.findOne({
          where: { id_proyecto: proyecto.id },
          transaction: t,
        });

        await resumenCuentaService.crearResumenInicial(
          {
            id_suscripcion: nuevaSuscripcion.id,
            id_proyecto: proyecto.id,
            id_usuario: nuevaSuscripcion.id_usuario,
            detalle_cuota: cuotaMensual,
          },
          t,
        );
      }

      await t.commit();

      try {
        const usuario = await UsuarioService.findById(
          nuevaSuscripcion.id_usuario,
        );
        if (usuario && usuario.email) {
          await emailService.notificarSuscripcionExitosa(
            usuario.email,
            proyecto,
          );
        }
      } catch (error) {
        console.error(
          `Error al enviar email de suscripción exitosa al usuario ${nuevaSuscripcion.id_usuario}:`,
          error.message,
        );
      }

      return nuevaSuscripcion;
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },

  /**
   * @async
   * @function findUsersByProjectId
   * @description Obtiene los objetos de Usuario asociados a las suscripciones activas de un proyecto.
   * @param {number} projectId - ID del proyecto.
   * @returns {Promise<Usuario[]>} Lista de usuarios suscriptores activos.
   */
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

  /**
   * @async
   * @function findById
   * @description Busca una suscripción por su clave primaria (ID).
   * @param {number} id - ID de la suscripción.
   * @returns {Promise<SuscripcionProyecto|null>}
   */
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

  /**
   * @async
   * @function findByIdAndUserId
   * @description Busca una suscripción por ID y verifica que pertenezca al usuario.
   * @param {number} id - ID de la suscripción.
   * @param {number} userId - ID del usuario.
   * @returns {Promise<SuscripcionProyecto|null>}
   */
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

  /**
   * @async
   * @function findByUserAndProjectId
   * @description Busca la suscripción activa de un usuario a un proyecto específico.
   * @param {number} userId - ID del usuario.
   * @param {number} projectId - ID del proyecto.
   * @returns {Promise<SuscripcionProyecto|null>}
   */
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

  /**
   * @async
   * @function findAll
   * @description Obtiene todas las suscripciones (activas e inactivas).
   * @returns {Promise<SuscripcionProyecto[]>}
   */
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

  /**
   * @async
   * @function findAllActivo
   * @description Obtiene todas las suscripciones activas (activo: true).
   * @returns {Promise<SuscripcionProyecto[]>}
   */
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

  /**
   * @async
   * @function findByUserId
   * @description Busca todas las suscripciones activas de un usuario, incluyendo el Proyecto asociado.
   * @param {number} userId - ID del usuario.
   * @returns {Promise<SuscripcionProyecto[]>}
   */
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

  /**
   * @async
   * @function findSubscriptionsReadyForPayments
   * @description Busca suscripciones activas donde el pago aún no se ha generado (`pago_generado: false`) y cuyo proyecto ya cumplió el objetivo.
   * @returns {Promise<SuscripcionProyecto[]>}
   */
  async findSubscriptionsReadyForPayments() {
    return SuscripcionProyecto.findAll({
      where: {
        pago_generado: false,
      },
      include: [
        {
          model: Proyecto,
          as: "proyectoAsociado",
          where: { objetivo_cumplido: true },
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

  /**
   * @async
   * @function update
   * @description Actualiza los datos de una suscripción por ID.
   * @param {number} id - ID de la suscripción.
   * @param {Object} data - Datos a actualizar.
   * @returns {Promise<SuscripcionProyecto|null>} La instancia actualizada o null.
   */
  async update(id, data) {
    const suscripcion = await this.findById(id);
    if (!suscripcion) {
      return null;
    }
    return suscripcion.update(data);
  },

  /**
   * @async
   * @function softDelete
   * @description Cancela una suscripción (soft delete), actualiza el proyecto,
   * valida la puja ganadora, registra la cancelación y limpia los pagos pendientes o vencidos.
   * Si el usuario tiene una puja ganadora_pendiente, la cancela y procesa el lote
   * (siguiente postor o limpieza) dentro de la misma transacción atómica.
   * @param {number} suscripcionId - ID de la suscripción a cancelar.
   * @param {Object} usuarioAutenticado - El objeto del Usuario autenticado (incluye id y rol).
   * @returns {Promise<SuscripcionProyecto>} La suscripción actualizada como inactiva.
   * @throws {Error} Si la suscripción no existe, ya está cancelada, no te pertenece o tiene pujas pagadas asociadas.
   */
  async softDelete(suscripcionId, usuarioAutenticado) {
    const t = await sequelize.transaction();
    try {
      const pujaService = require("./puja.service");
      const pagoService = require("./pago.service");
      const loteService = require("./lote.service");

      // 1. Validar suscripción y permisos
      const suscripcion = await SuscripcionProyecto.findByPk(suscripcionId, {
        transaction: t,
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

      // 2. Validar que no tenga pujas ganadas y pagadas
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

      // 3. Verificar si tiene una puja ganadora PENDIENTE de pago
      const pujaPendiente = await pujaService.findOne({
        where: {
          id_usuario: suscripcion.id_usuario,
          id_proyecto: suscripcion.id_proyecto,
          estado_puja: "ganadora_pendiente",
        },
        transaction: t,
      });

      if (pujaPendiente) {
        // Marcar la puja como incumplimiento dentro de la misma transacción
        await pujaPendiente.update(
          {
            estado_puja: "ganadora_incumplimiento",
            fecha_vencimiento_pago: null,
          },
          { transaction: t },
        );

        // Procesar el lote (siguiente postor o limpieza) — atómico con el resto
        await loteService.procesarImpagoLote(pujaPendiente.id_lote, t);
      }

      // 4. Cancelar todos los pagos pendientes o vencidos
      const pagosCancelados =
        await pagoService.cancelPendingPaymentsBySubscription(
          suscripcion.id,
          "Cancelación de suscripción",
          { transaction: t },
        );

      // 5. Obtener pagos ya realizados (para el registro)
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

      // 6. Marcar suscripción como inactiva
      await suscripcion.update({ activo: false }, { transaction: t });

      // 7. Actualizar contador del proyecto
      const proyecto = await Proyecto.findByPk(suscripcion.id_proyecto, {
        transaction: t,
      });

      if (proyecto) {
        await proyecto.decrement("suscripciones_actuales", {
          by: 1,
          transaction: t,
        });
      }

      // 8. Registrar la cancelación
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

      // 9. Registrar evento en resumen de cuenta
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

      await t.commit();

      // 10. Notificaciones (fuera de la transacción)
      this._sendCancellationNotifications(suscripcion, proyecto, {
        pagosCancelados,
        pagosRealizados: pagosRealizados.length,
        montoTotalPagado,
      });

      // 10b. Notificar cancelación de puja si aplica (fuera de la transacción)
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
            console.error(
              `Error notificando cancelación de puja por baja de suscripción (usuario ${suscripcion.id_usuario}):`,
              err.message,
            );
          }
        });
      }

      return suscripcion;
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },

  /**
   * @async
   * @private
   * @function _sendCancellationNotifications
   * @description Envía notificaciones (email y mensaje) después de cancelar una suscripción.
   * @param {SuscripcionProyecto} suscripcion - La suscripción cancelada.
   * @param {Proyecto} proyecto - El proyecto asociado.
   * @param {Object} metrics - Métricas de la cancelación.
   */
  async _sendCancellationNotifications(suscripcion, proyecto, metrics) {
    try {
      const usuario = await UsuarioService.findById(suscripcion.id_usuario);
      if (!usuario?.email) return;

      // Email de notificación
      await emailService.notificarCancelacionSuscripcion(
        usuario.email,
        proyecto,
        {
          pagos_cancelados: metrics.pagosCancelados,
          pagos_realizados: metrics.pagosRealizados,
          monto_total_pagado: metrics.montoTotalPagado,
        },
      );

      // Mensaje interno
      const contenido = `Tu suscripción al proyecto "${proyecto.nombre_proyecto}" ha sido cancelada exitosamente. 
    Pagos realizados: ${metrics.pagosRealizados} ($${metrics.montoTotalPagado.toFixed(2)})
    Pagos pendientes cancelados: ${metrics.pagosCancelados}`;

      await MensajeService.crear({
        id_remitente: 1,
        id_receptor: usuario.id,
        contenido: contenido,
      });
    } catch (error) {
      console.error(
        `Error al enviar notificaciones de cancelación al usuario ${suscripcion.id_usuario}:`,
        error.message,
      );
    }
  },
  /**
   * @async
   * @function findAllCanceladas
   * @description Busca todas las suscripciones canceladas. (Para uso de Administradores)
   * @returns {Promise<SuscripcionCancelada[]>}
   */
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

  /**
   * @async
   * @function findActiveByProjectId
   * @description Busca TODAS las suscripciones ACTIVAS de un proyecto específico. (USADO POR CRON)
   * @param {number} projectId - ID del proyecto.
   * @param {object} [t] - Transacción de Sequelize opcional.
   * @returns {Promise<SuscripcionProyecto[]>}
   */
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

  /**
   * @async
   * @function findAllByProjectId
   * @description Busca TODAS las suscripciones (activas e inactivas) de un proyecto.
   * @param {number} projectId - ID del proyecto.
   * @param {object} [t] - Transacción de Sequelize opcional.
   * @returns {Promise<SuscripcionProyecto[]>}
   */
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

  /**
   * @async
   * @function findMyCanceladas
   * @description Busca todas las suscripciones canceladas por un ID de usuario específico.
   * @param {number} userId - ID del usuario.
   * @returns {Promise<SuscripcionCancelada[]>}
   */
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

  /**
   * @async
   * @function findByProjectCanceladas
   * @description Busca todas las suscripciones canceladas de un proyecto específico.
   * @param {number} projectId - ID del proyecto.
   * @returns {Promise<SuscripcionCancelada[]>}
   */
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

  // -------------------------------------------------------------------
  // 📊 NUEVAS FUNCIONES DE REPORTE/MÉTRICAS
  // -------------------------------------------------------------------

  /**
   * @async
   * @function getMorosityMetrics
   * @description Calcula la Tasa de Morosidad y el monto total de pagos pendientes/atrasados (KPI 4).
   * @returns {Promise<object>} Objeto con las métricas de morosidad.
   */
  async getMorosityMetrics() {
    const totalGeneradoResult = await Pago.sum("monto", {
      where: {
        estado_pago: {
          [Op.in]: [
            "pagado",
            "pendiente",
            "vencido",
            "cubierto_por_puja",
            "cancelado",
          ],
        },
      },
    });
    const totalGenerado = Number(totalGeneradoResult) || 0;

    const totalEnRiesgoResult = await Pago.sum("monto", {
      where: {
        estado_pago: { [Op.in]: ["pendiente", "vencido"] },
      },
    });
    const totalEnRiesgo = Number(totalEnRiesgoResult) || 0;

    if (totalGenerado === 0) {
      return {
        total_pagos_generados: 0,
        total_en_riesgo: 0,
        tasa_morosidad: 0.0,
      };
    }

    const tasaMorosidad = (totalEnRiesgo / totalGenerado) * 100;

    return {
      total_pagos_generados: totalGenerado.toFixed(2),
      total_en_riesgo: totalEnRiesgo.toFixed(2),
      tasa_morosidad: tasaMorosidad.toFixed(2),
    };
  },

  /**
   * @async
   * @function getCancellationRate
   * @description Calcula la Tasa de Cancelación de Suscripciones (Churn Rate) (KPI 5).
   * @returns {Promise<object>} Objeto con la tasa de cancelación.
   */
  async getCancellationRate() {
    const totalSuscripciones = await SuscripcionProyecto.count();

    if (totalSuscripciones === 0) {
      return {
        total_suscripciones: 0,
        total_canceladas: 0,
        tasa_cancelacion: 0.0,
      };
    }

    const totalCanceladas = await SuscripcionProyecto.count({
      where: { activo: false },
    });

    const tasaCancelacion = (totalCanceladas / totalSuscripciones) * 100;

    return {
      total_suscripciones: totalSuscripciones,
      total_canceladas: totalCanceladas,
      tasa_cancelacion: tasaCancelacion.toFixed(2),
    };
  },
};

module.exports = suscripcionProyectoService;
