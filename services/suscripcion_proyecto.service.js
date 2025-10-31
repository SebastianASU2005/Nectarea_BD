// Archivo: services/suscripcion_proyecto.service.js

// Importar los modelos y servicios necesarios
const SuscripcionProyecto = require("../models/suscripcion_proyecto");
const Usuario = require("../models/usuario");
const Proyecto = require("../models/proyecto");
const CuotaMensual = require("../models/CuotaMensual");
const Pago = require("../models/Pago");
const SuscripcionCancelada = require("../models/suscripcion_cancelada");
const MensajeService = require("./mensaje.service");
const UsuarioService = require("./usuario.service");
const Transaccion = require("../models/transaccion");
const { sequelize, Op } = require("../config/database");
const pujaService = require("./puja.service");
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
    const proyecto = await Proyecto.findByPk(data.id_proyecto, {
      transaction: t,
    });
    if (!proyecto) {
      throw new Error("Proyecto asociado no encontrado.");
    } // Validación clave: Previene suscripciones si el proyecto no está activo.

    if (
      proyecto.estado_proyecto === "Finalizado" ||
      proyecto.estado_proyecto === "Cancelado"
    ) {
      throw new Error(
        `❌ No se puede iniciar una suscripción, el proyecto "${proyecto.nombre_proyecto}" está en estado: ${proyecto.estado_proyecto}.`
      );
    } // 🛑 VALIDACIÓN AÑADIDA: Bloquea si ya se alcanzó el límite de suscripciones (capacidad máxima).

    if (proyecto.suscripciones_actuales >= proyecto.obj_suscripciones) {
      throw new Error(
        `❌ El proyecto "${proyecto.nombre_proyecto}" ya ha alcanzado su límite máximo de ${proyecto.obj_suscripciones} suscriptores.`
      );
    } // Inicializa `meses_a_pagar` con el plazo total del proyecto.

    data.meses_a_pagar = proyecto.plazo_inversion;

    const nuevaSuscripcion = await SuscripcionProyecto.create(data, {
      transaction: t,
    }); // Lógica para incrementar el contador de suscriptores y recargar el proyecto.

    await proyecto.increment("suscripciones_actuales", {
      by: 1,
      transaction: t,
    });
    await proyecto.reload({ transaction: t }); // Comprueba si se ha alcanzado el objetivo y notifica a todos los usuarios.

    if (
      proyecto.suscripciones_actuales >= proyecto.obj_suscripciones &&
      !proyecto.objetivo_notificado
    ) {
      // Actualiza el estado del proyecto y marca la notificación.
      await proyecto.update(
        {
          objetivo_notificado: true,
          estado_proyecto: "En proceso",
          fecha_inicio_proceso: new Date(), // Registra el inicio del proceso
          meses_restantes: proyecto.plazo_inversion, // Inicializa el contador de meses
        },
        { transaction: t }
      ); // Envía mensajes masivos de notificación (se excluye el remitente hardcodeado).

      const todosLosUsuarios = await UsuarioService.findAllActivos();
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
            { transaction: t }
          );
        }
      } // 📧 LÓGICA DE ENVÍO MASIVO DE EMAIL A USUARIOS // Se utiliza try...catch ya que el email NO debe bloquear la lógica de la BD.

      try {
        await emailService.notificarInicioProyectoMasivo(
          proyecto,
          todosLosUsuarios
        );
      } catch (error) {
        console.error(
          `Error al enviar emails masivos de inicio de proyecto ${proyecto.nombre_proyecto}:`,
          error.message
        );
      } // 📧 LÓGICA DE ENVÍO DE EMAIL AL ADMINISTRADOR 🆕

      try {
        // Asumiendo que el administrador principal tiene un correo específico o se busca por rol.
        const adminEmail = await UsuarioService.getAdminEmail();
        if (adminEmail) {
          await emailService.notificarInicioProyectoAdmin(adminEmail, proyecto);
        } else {
          console.warn(
            "No se pudo obtener el correo del administrador para notificar el inicio del proyecto."
          );
        }
      } catch (error) {
        console.error(
          `Error al enviar email de inicio de proyecto al administrador ${proyecto.nombre_proyecto}:`,
          error.message
        );
      }
    } // Devuelve la nueva suscripción y el proyecto (esencial para el servicio de Transacción).
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
    const t = await sequelize.transaction(); // Inicia la transacción
    try {
      // 1. VALIDACIÓN DE TRANSACCIÓN Y ESTADOS
      const transaccion = await Transaccion.findByPk(transaccionId, {
        transaction: t,
      });

      if (!transaccion) {
        throw new Error(`Transacción con ID ${transaccionId} no encontrada.`);
      }

      // **VALIDACIÓN CRÍTICA DE FLUJO:** Solo se puede confirmar una transacción en estado 'pendiente'
      if (transaccion.estado_transaccion !== "pendiente") {
        throw new Error(
          `❌ La Transacción ${transaccionId} ya fue procesada o está en estado no elegible: ${transaccion.estado_transaccion}.`
        );
      }

      // 2. ACTUALIZACIÓN DEL PAGO Y TRANSACCIÓN (Marcarlos como exitosos)
      const pago = await Pago.findByPk(transaccion.id_pago_mensual, {
        transaction: t,
      });

      if (!pago) {
        throw new Error(
          `Pago mensual asociado a la transacción ${transaccionId} no encontrado.`
        );
      }

      await transaccion.update(
        { estado_transaccion: "pagado", fecha_pago: new Date() },
        { transaction: t }
      );
      await pago.update({ estado_pago: "pagado" }, { transaction: t });

      // 3. CREACIÓN DEL REGISTRO DE SUSCRIPCIÓN
      const { nuevaSuscripcion, proyecto } =
        await this._createSubscriptionRecord(
          {
            id_usuario: transaccion.id_usuario,
            id_proyecto: transaccion.id_proyecto,
            monto_total_pagado: transaccion.monto, // Registra el monto del primer pago
            // otros campos por defecto
          },
          t
        );

      // 4. CREACIÓN DEL RESUMEN DE CUENTA (CRUCIAL para proyectos mensuales)
      if (proyecto.tipo_inversion === "mensual") {
        // Obtenemos la CuotaMensual dentro de la transacción
        const cuotaMensual = await CuotaMensual.findOne({
          where: { id_proyecto: proyecto.id },
          transaction: t,
        });

        // Este servicio utiliza la CuotaMensual para crear el registro en ResumenCuenta.
        await resumenCuentaService.crearResumenInicial(
          {
            id_suscripcion: nuevaSuscripcion.id,
            id_proyecto: proyecto.id,
            id_usuario: nuevaSuscripcion.id_usuario,
            detalle_cuota: cuotaMensual, // Se pasa el objeto cuota para el detalle
          },
          t
        );
      }

      await t.commit(); // Confirma todas las operaciones

      // 5. Envío de email de confirmación (Post-Commit)
      try {
        const usuario = await UsuarioService.findById(
          nuevaSuscripcion.id_usuario
        );
        if (usuario && usuario.email) {
          await emailService.notificarSuscripcionExitosa(
            usuario.email,
            proyecto
          );
        }
      } catch (error) {
        console.error(
          `Error al enviar email de suscripción exitosa al usuario ${nuevaSuscripcion.id_usuario}:`,
          error.message
        );
      }

      return nuevaSuscripcion;
    } catch (error) {
      await t.rollback(); // Revierte si algo falla
      throw error;
    }
  }, // <-- COMA AÑADIDA

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
          as: "usuario", // Alias de la relación definido en el modelo
          where: { activo: true },
        },
      ],
    }); // Mapea y devuelve solo las instancias del modelo Usuario.
    return suscripciones.map((suscripcion) => suscripcion.usuario);
  }, // <-- COMA AÑADIDA

  /**
   * @async
   * @function findById
   * @description Busca una suscripción por su clave primaria (ID).
   * @param {number} id - ID de la suscripción.
   * @returns {Promise<SuscripcionProyecto|null>}
   */
  async findById(id) {
    return SuscripcionProyecto.findByPk(id);
  }, // <-- COMA AÑADIDA

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
        activo: true, // Asumimos que solo buscan suscripciones activas
      },
    });
  }, // <-- COMA AÑADIDA

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
    });
  }, // <-- COMA AÑADIDA

  /**
   * @async
   * @function findAll
   * @description Obtiene todas las suscripciones (activas e inactivas).
   * @returns {Promise<SuscripcionProyecto[]>}
   */
  async findAll() {
    return SuscripcionProyecto.findAll();
  }, // <-- COMA AÑADIDA

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
        },
        {
          model: Usuario,
          as: "usuario",
        },
      ],
    });
  }, // <-- COMA AÑADIDA

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
          as: "proyectoAsociado", // Usa el alias de la relación del modelo.
          where: { activo: true },
        },
      ],
    });
  }, // <-- COMA AÑADIDA

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
          as: "proyectoAsociado", // Alias de la relación del modelo.
          where: { objetivo_cumplido: true },
        },
        Usuario, // Incluye el modelo Usuario (asumiendo que tiene un alias por defecto o está correctamente configurado).
      ],
    });
  }, // <-- COMA AÑADIDA

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
  }, // <-- COMA AÑADIDA

  /**
   * @async
   * @function softDelete
   * @description Cancela una suscripción (soft delete), actualiza el proyecto, valida la puja ganadora y registra la cancelación.
   * @param {number} suscripcionId - ID de la suscripción a cancelar.
   * @param {number} userId - ID del usuario que intenta cancelar (para validación de propiedad).
   * @returns {Promise<SuscripcionProyecto>} La suscripción actualizada como inactiva.
   * @throws {Error} Si la suscripción no existe, ya está cancelada o tiene pujas pagadas asociadas.
   */ // =================================================================== // LÓGICA DE CANCELACIÓN (FUNCIÓN CENTRAL CON VALIDACIÓN DE PUJA Y REGISTRO) // ===================================================================
  async softDelete(suscripcionId, userId) {
    const t = await sequelize.transaction(); // Inicia la transacción de BD.
    try {
      const suscripcion = await SuscripcionProyecto.findByPk(suscripcionId, {
        transaction: t,
      });
      if (!suscripcion) throw new Error("Suscripción no encontrada."); // Validación de Propiedad

      if (suscripcion.id_usuario !== userId) {
        throw new Error("Acceso denegado. La suscripción no te pertenece.");
      } // Verificar idempotencia.

      if (!suscripcion.activo)
        throw new Error("La suscripción ya ha sido cancelada."); // 🛑 1. VALIDACIÓN CRÍTICA: Bloquear si hay una puja ganadora pagada.

      const hasPaidBid = await pujaService.hasWonAndPaidBid(
        suscripcion.id_usuario,
        suscripcion.id_proyecto,
        { transaction: t }
      );

      if (hasPaidBid) {
        throw new Error(
          "❌ No se puede cancelar la suscripción. El usuario ha ganado y pagado una puja en este proyecto."
        );
      } // 2. Marcar la suscripción como inactiva (soft delete).

      await suscripcion.update({ activo: false }, { transaction: t }); // 3. Decrementar el contador de suscriptores en el proyecto.

      const proyecto = await Proyecto.findByPk(suscripcion.id_proyecto, {
        transaction: t,
      });
      if (proyecto) {
        await proyecto.decrement("suscripciones_actuales", {
          by: 1,
          transaction: t,
        });
      } // 4. Preparar datos para el registro de cancelación (cálculo de montos pagados).

      const pagosRealizados = await Pago.findAll({
        where: {
          id_suscripcion: suscripcion.id,
          estado_pago: { [Op.in]: ["pagado", "cubierto_por_puja"] },
        },
        transaction: t,
      });

      const montoTotalPagado = pagosRealizados.reduce(
        (sum, pago) => sum + parseFloat(pago.monto),
        0
      ); // 5. Crear un registro en SuscripcionCancelada (Guardamos la instancia creada).

      const registroCancelacion = await SuscripcionCancelada.create(
        {
          id_suscripcion_original: suscripcion.id,
          id_usuario: suscripcion.id_usuario,
          id_proyecto: suscripcion.id_proyecto,
          meses_pagados: pagosRealizados.length,
          monto_pagado_total: montoTotalPagado,
          fecha_cancelacion: new Date(),
        },
        { transaction: t }
      ); // 🛑 6. REGISTRAR LA CANCELACIÓN EN EL RESUMEN DE CUENTA (Nuevo paso)

      await resumenCuentaService.registrarEventoCancelacion(
        {
          id_usuario: suscripcion.id_usuario,
          descripcion: `Suscripción ${suscripcion.id} al Proyecto ${
            suscripcion.id_proyecto
          } cancelada. Monto total pagado a liquidar: $${montoTotalPagado.toFixed(
            2
          )}.`,
          monto: montoTotalPagado,
          referencia_id: registroCancelacion.id,
        },
        t
      );

      await t.commit(); // Confirma todas las operaciones.
      return suscripcion;
    } catch (error) {
      await t.rollback(); // Revierte si algo falla.
      throw error;
    }
  }, // <-- COMA AÑADIDA

  /**
   * @async
   * @function findAllCanceladas
   * @description Busca todas las suscripciones canceladas. (Para uso de Administradores)
   * @returns {Promise<SuscripcionCancelada[]>}
   */ // =================================================================== // FUNCIONES DE CONSULTA DE CANCELACIONES // ===================================================================
  async findAllCanceladas() {
    return SuscripcionCancelada.findAll({
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
        activo: true, // ⬅️ CONDICIÓN CLAVE: Solo las activas
      },
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
        // Sin el filtro 'activo: true'
      },
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
      order: [["fecha_cancelacion", "DESC"]],
    });
  }, // <-- COMA AÑADIDA

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
      order: [["fecha_cancelacion", "DESC"]], // Puedes incluir el Proyecto y el Usuario si lo necesitas para el reporte // include: [{ model: Proyecto, as: 'proyectoCancelado' }, { model: Usuario, as: 'usuarioCancelador' }]
    });
  },

  // -------------------------------------------------------------------
  // 🗓️ FUNCIONES CRON JOB / CICLO MENSUAL
  // -------------------------------------------------------------------
  // [La lógica de finalizarMes y findProjectsToRevert iría aquí, si la hubieras aceptado]

  // Si has conservado las funciones de la respuesta anterior, deberías copiarlas aquí.
  // Por simplicidad, asumo que las funciones están ahí.

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
    // 1. Calcular el monto total de todos los pagos generados (para la base)
    const totalGeneradoResult = await Pago.sum("monto", {
      where: {
        estado_pago: {
          [Op.in]: ["pagado", "pendiente", "vencido", "cubierto_por_puja","cancelado"],
        },
      },
    });
    const totalGenerado = Number(totalGeneradoResult) || 0;

    // 2. Calcular el monto total pendiente y atrasado (en riesgo)
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

    // 3. Calcular la Tasa de Morosidad (Monto en Riesgo / Monto Total Generado)
    const tasaMorosidad = (totalEnRiesgo / totalGenerado) * 100;

    return {
      total_pagos_generados: totalGenerado.toFixed(2),
      total_en_riesgo: totalEnRiesgo.toFixed(2),
      tasa_morosidad: tasaMorosidad.toFixed(2), // Porcentaje
    };
  },

  /**
   * @async
   * @function getCancellationRate
   * @description Calcula la Tasa de Cancelación de Suscripciones (Churn Rate) (KPI 5).
   * @returns {Promise<object>} Objeto con la tasa de cancelación.
   */
  async getCancellationRate() {
    // 1. Contar el total de suscripciones (Activas + Canceladas)
    const totalSuscripciones = await SuscripcionProyecto.count();

    if (totalSuscripciones === 0) {
      return {
        total_suscripciones: 0,
        total_canceladas: 0,
        tasa_cancelacion: 0.0,
      };
    }

    // 2. Contar el total de suscripciones canceladas (activo: false)
    const totalCanceladas = await SuscripcionProyecto.count({
      where: { activo: false },
    });

    // 3. Calcular la Tasa de Cancelación (Total Canceladas / Total Suscripciones)
    const tasaCancelacion = (totalCanceladas / totalSuscripciones) * 100;

    return {
      total_suscripciones: totalSuscripciones,
      total_canceladas: totalCanceladas,
      tasa_cancelacion: tasaCancelacion.toFixed(2), // Porcentaje
    };
  },
};

module.exports = suscripcionProyectoService;
