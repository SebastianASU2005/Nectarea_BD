const { sequelize } = require("../config/database");
const { Op } = require("sequelize");
const Transaccion = require("../models/transaccion");
const Pago = require("../models/Pago");
const PagoMercado = require("../models/pagoMercado");
const SuscripcionProyecto = require("../models/suscripcion_proyecto");
const Proyecto = require("../models/proyecto");

// Servicios externos necesarios para la lógica de negocio
const paymentService = require("./pagoMercado.service");
const Inversion = require("../models/inversion");
const inversionService = require("./inversion.service");
const pagoService = require("../services/pago.service");
const suscripcionService = require("./suscripcion_proyecto.service");
const resumenCuentaService = require("./resumen_cuenta.service");
const pujaService = require("./puja.service");

// Helper para asegurar el tipo de dato numérico
const toFloat = (value) => parseFloat(value);
const TRANSACTION_TIMEOUT_MINUTES = 30; // ⏱️ Transacciones expiran en 30 min

/**
 * Servicio de lógica de negocio para la gestión de Transacciones y su integración
 * con pasarelas de pago y lógica de negocio principal (Inversiones, Pagos, Pujas).
 */
const transaccionService = {
  // =========================================================================
  // NUEVO FLUJO: Generar Checkout para una Transacción YA CREADA
  // =========================================================================

  async generarCheckoutParaTransaccionExistente(
    transaccion,
    metodo = "mercadopago",
    options = {}
  ) {
    const t = options.transaction;
    if (!t) {
      throw new Error(
        "Se requiere una transacción de BD activa (options.transaction)"
      );
    }

    // Validación de estado: permite regenerar solo si está pendiente o fallida.
    if (
      transaccion.estado_transaccion !== "pendiente" &&
      transaccion.estado_transaccion !== "fallido"
    ) {
      throw new Error(
        `La Transacción #${transaccion.id} ya fue procesada o está en estado: ${transaccion.estado_transaccion}.`
      );
    }

    // 1. Generar preferencia de pago en la pasarela.
    const { preferenceId, redirectUrl } = await this._generarPreferenciaPago(
      transaccion,
      metodo
    );

    // 2. Crear o actualizar el registro de PagoMercado.
    const [pagoMercado, created] = await PagoMercado.findOrCreate({
      where: { id_transaccion: transaccion.id, metodo_pasarela: metodo },
      defaults: {
        monto_pagado: transaccion.monto,
        metodo_pasarela: metodo,
        id_transaccion_pasarela: preferenceId,
        estado: "pendiente",
      },
      transaction: t,
    });

    // Si el registro ya existía, se actualiza la preferencia y se resetea el estado a pendiente.
    if (!created) {
      await pagoMercado.update(
        {
          monto_pagado: transaccion.monto,
          id_transaccion_pasarela: preferenceId,
          estado: "pendiente",
        },
        { transaction: t }
      );
    }

    // 3. Vincular el PagoMercado a la Transacción y asegurar el estado 'pendiente'.
    await transaccion.update(
      { id_pago_pasarela: pagoMercado.id, estado_transaccion: "pendiente" },
      { transaction: t }
    );

    return {
      transaccion,
      pagoMercado,
      redirectUrl,
    };
  },
  // =========================================================================
  // FLUJO ORIGINAL: Crea Transacción y luego su Checkout
  // =========================================================================

  async crearTransaccionConCheckout(
    data,
    metodo = "mercadopago",
    options = {}
  ) {
    const t = options.transaction;
    if (!t) {
      throw new Error(
        "Se requiere una transacción de BD activa (options.transaction)"
      );
    }

    this._validarDatosTransaccion(data);

    // 1. Crear la transacción (Estado inicial: pendiente)
    const transaccion = await Transaccion.create(
      {
        tipo_transaccion: data.tipo_transaccion,
        monto: data.monto,
        id_usuario: data.id_usuario,
        id_proyecto: data.id_proyecto || null,
        id_inversion: data.id_inversion || null,
        id_puja: data.id_puja || null,
        id_suscripcion: data.id_suscripcion || null,
        id_pago_mensual: data.id_pago_mensual || null,
        estado_transaccion: "pendiente",
      },
      { transaction: t }
    );

    // 2. Llama al flujo para generar la preferencia y PagoMercado,
    //    y lo vincula a la transacción recién creada.
    return this.generarCheckoutParaTransaccionExistente(
      transaccion,
      "mercadopago",
      options
    );
  },

  // =========================================================================
  // LÓGICA DE CONFIRMACIÓN Y REVERSIÓN (Webhook/Operaciones Manuales)
  // =========================================================================

  async procesarFalloTransaccion(
    transaccionId,
    targetStatus = "fallido",
    errorDetail = "Transacción fallida por pasarela de pago.",
    options = {}
  ) {
    const t = options.transaction || (await sequelize.transaction());
    const isNewTransaction = !options.transaction;

    let transaccion;

    try {
      transaccion = await Transaccion.findByPk(transaccionId, {
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      if (!transaccion) {
        throw new Error("Transacción no encontrada.");
      }

      // Idempotencia: Si ya está en un estado terminal (ej. pagado/revertido), retornar.
      if (
        transaccion.estado_transaccion === "pagado" ||
        transaccion.estado_transaccion === "revertido"
      ) {
        if (isNewTransaction) await t.commit();
        return transaccion;
      }

      // 2. Manejo de lógica de negocio (solo para fallos/reembolsos relevantes)
      if (targetStatus === "fallido" || targetStatus === "reembolsado") {
        if (
          transaccion.tipo_transaccion === "pago_suscripcion_inicial" ||
          transaccion.tipo_transaccion === "mensual"
        ) {
          const idPagoMensual = transaccion.id_pago_mensual;
          if (idPagoMensual) {
            await pagoService.handlePaymentFailure(idPagoMensual, t);
          }
        }
      }

      // 3. Actualizar estado final de la Transacción.
      await transaccion.update(
        {
          estado_transaccion: targetStatus,
          fecha_transaccion: new Date(),
          error_detalle: errorDetail,
        },
        { transaction: t }
      );

      console.log(
        `✅ Transacción ${transaccionId} marcada como '${targetStatus}'.`
      );

      if (isNewTransaction) await t.commit();
      return transaccion;
    } catch (error) {
      console.error(
        `Error al procesar la falla de la transacción ${transaccionId}: ${error.message}`
      );
      if (isNewTransaction) await t.rollback();
      throw new Error(`Error en el procesamiento de fallo: ${error.message}`);
    }
  },

  async cancelarTransaccionPorUsuario(transaccionId) {
    const t = await sequelize.transaction();
    try {
      const transaccion = await Transaccion.findByPk(transaccionId, {
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      if (!transaccion) {
        throw new Error(`Transacción ID ${transaccionId} no encontrada.`);
      }

      // Solo actualiza si el estado es 'pendiente'.
      if (transaccion.estado_transaccion === "pendiente") {
        await transaccion.update(
          {
            estado_transaccion: "fallido",
            error_detalle:
              "Operación cancelada por el usuario en la pasarela de pago.",
          },
          { transaction: t }
        );
        console.log(
          `❌ Transacción ${transaccionId} marcada como 'fallido' por cancelación de usuario.`
        );
        await t.commit();
        return true;
      }

      await t.commit();
      return false;
    } catch (error) {
      await t.rollback();
      console.error(
        `Error al cancelar transacción ${transaccionId}:`,
        error.message
      );
      throw error;
    }
  },

  // =========================================================================
  // FUNCIÓN DE INICIO
  // =========================================================================

  async iniciarTransaccionYCheckout(modelo, modeloId, userId) {
    const t = await sequelize.transaction();
    try {
      let entidadBase;
      let datosTransaccion = { id_usuario: userId, monto: 0 };

      // 1. Buscar la entidad base pendiente y preparar los datos de la transacción.
      switch (modelo.toLowerCase()) {
        case "inversion":
          entidadBase = await Inversion.findOne({
            where: { id: modeloId, id_usuario: userId, estado: "pendiente" },
            transaction: t,
          });
          if (!entidadBase) {
            throw new Error(
              `Inversión ${modeloId} no encontrada, no te pertenece o ya está pagada.`
            );
          }
          datosTransaccion = {
            ...datosTransaccion,
            tipo_transaccion: "directo",
            monto: toFloat(entidadBase.monto),
            id_proyecto: entidadBase.id_proyecto,
            id_inversion: entidadBase.id,
          };
          break;

        case "puja":
          entidadBase = await pujaService.getValidPaymentDetails(
            modeloId,
            userId,
            { transaction: t }
          );
          const montoPujaPagar = toFloat(entidadBase.monto_puja);

          datosTransaccion = {
            ...datosTransaccion,
            tipo_transaccion: "Puja",
            monto: montoPujaPagar,
            id_proyecto: entidadBase.lote.id_proyecto,
            id_puja: entidadBase.id,
          };
          break;

        case "pago":
          entidadBase = await Pago.findOne({
            where: {
              id: modeloId,
              id_usuario: userId,
              estado_pago: { [Op.in]: ["pendiente", "vencido"] },
            },
            include: [
              {
                model: SuscripcionProyecto,
                as: "suscripcion",
                attributes: ["id_proyecto"],
              },
            ],
            transaction: t,
          });

          if (!entidadBase) {
            throw new Error(
              `Pago ${modeloId} no encontrado, no te pertenece o ya está pagado.`
            );
          }

          let idProyecto = entidadBase.id_proyecto;

          if (!idProyecto && entidadBase.suscripcion) {
            idProyecto = entidadBase.suscripcion.id_proyecto;

            await entidadBase.update(
              { id_proyecto: idProyecto },
              { transaction: t }
            );
            console.log(
              `✅ Pago ${modeloId} actualizado con id_proyecto: ${idProyecto}`
            );
          }

          if (!idProyecto) {
            throw new Error(
              `Pago ${modeloId} no tiene id_proyecto asociado. Datos inconsistentes.`
            );
          }

          const esPagoMensual = !!entidadBase.id_suscripcion;
          const tipoTransaccion = esPagoMensual
            ? "mensual"
            : "pago_suscripcion_inicial";

          datosTransaccion = {
            ...datosTransaccion,
            tipo_transaccion: tipoTransaccion,
            monto: toFloat(entidadBase.monto),
            id_proyecto: idProyecto,
            id_suscripcion: entidadBase.id_suscripcion || null,
            id_pago_mensual: entidadBase.id,
          };
          break;

        default:
          throw new Error(`Modelo de pago no soportado: ${modelo}`);
      }

      // 2. LÓGICA DE REINTENTO
      let resultadoCheckout;

      if (modelo.toLowerCase() === "puja") {
        await Transaccion.update(
          {
            estado_transaccion: "fallido",
            error_detalle: "Transacción obsoleta o con reintento de pago.",
          },
          {
            where: {
              id_puja: datosTransaccion.id_puja,
              estado_transaccion: { [Op.in]: ["pendiente", "fallido"] },
            },
            transaction: t,
          }
        );

        resultadoCheckout = await this.crearTransaccionConCheckout(
          datosTransaccion,
          "mercadopago",
          { transaction: t }
        );
      } else {
        const whereClause = {
          id_usuario: userId,
          estado_transaccion: {
            [Op.in]: ["pendiente", "fallido"],
          },
        };

        if (datosTransaccion.id_inversion) {
          whereClause.id_inversion = datosTransaccion.id_inversion;
        } else if (datosTransaccion.id_pago_mensual) {
          whereClause.id_pago_mensual = datosTransaccion.id_pago_mensual;
        }

        const existingTransaccion = await Transaccion.findOne({
          where: whereClause,
          transaction: t,
        });

        if (existingTransaccion) {
          console.log(
            `Transacción pendiente/fallida #${existingTransaccion.id} encontrada. Regenerando checkout...`
          );

          if (
            toFloat(existingTransaccion.monto) !==
            toFloat(datosTransaccion.monto)
          ) {
            await existingTransaccion.update(
              {
                monto: datosTransaccion.monto,
                estado_transaccion: "pendiente",
              },
              { transaction: t }
            );
          }

          resultadoCheckout =
            await this.generarCheckoutParaTransaccionExistente(
              existingTransaccion,
              "mercadopago",
              { transaction: t }
            );
        } else {
          resultadoCheckout = await this.crearTransaccionConCheckout(
            datosTransaccion,
            "mercadopago",
            { transaction: t }
          );
        }
      }

      await t.commit();
      return resultadoCheckout;
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },

  // =========================================================================
  // FUNCIONES ASISTENTES DE LÓGICA DE NEGOCIO
  // =========================================================================

  async manejarPagoSuscripcionInicial(transaccion, montoTransaccion, t) {
    if (!transaccion.id_pago_mensual) {
      throw new Error("Transacción 'pago_suscripcion_inicial' sin ID de pago.");
    }
    const idPagoMensual = transaccion.id_pago_mensual;

    const pagoToUpdate = await Pago.findByPk(idPagoMensual, {
      transaction: t,
    });
    if (!pagoToUpdate) {
      throw new Error(`El Pago inicial ID ${idPagoMensual} no fue encontrado.`);
    }

    const { nuevaSuscripcion, proyecto } =
      await suscripcionService._createSubscriptionRecord(
        {
          id_usuario: transaccion.id_usuario,
          id_proyecto: transaccion.id_proyecto,
          monto_suscripcion: montoTransaccion,
        },
        t
      );

    if (!nuevaSuscripcion || !proyecto) {
      throw new Error("Error al crear suscripción.");
    }

    await pagoToUpdate.update(
      { id_suscripcion: nuevaSuscripcion.id },
      { transaction: t }
    );

    await transaccion.update(
      { id_suscripcion: nuevaSuscripcion.id },
      { transaction: t }
    );

    if (nuevaSuscripcion.meses_a_pagar > 0) {
      await nuevaSuscripcion.decrement("meses_a_pagar", {
        by: 1,
        transaction: t,
      });
    }

    await pagoService.markAsPaid(idPagoMensual, t);

    await resumenCuentaService.createAccountSummary(
      nuevaSuscripcion,
      proyecto,
      { transaction: t }
    );
    await resumenCuentaService.updateAccountSummaryOnPayment(
      nuevaSuscripcion.id,
      { transaction: t }
    );
    await resumenCuentaService.actualizarSaldoGeneral(
      transaccion.id_usuario,
      -montoTransaccion,
      t
    );
  },

  async manejarPagoMensual(transaccion, montoTransaccion, t) {
    if (!transaccion.id_pago_mensual) {
      throw new Error("Transacción 'mensual' sin ID de pago.");
    }
    const idPMensual = transaccion.id_pago_mensual;

    await pagoService.markAsPaid(idPMensual, t);

    const pago = await Pago.findByPk(idPMensual, { transaction: t });
    if (!pago || !pago.id_suscripcion) {
      throw new Error(
        "Pago o ID de suscripción no encontrada en el modelo Pago."
      );
    }

    const suscripcion = await suscripcionService.findById(pago.id_suscripcion, {
      transaction: t,
    });
    if (!suscripcion) {
      throw new Error(`Suscripción ${pago.id_suscripcion} no encontrada.`);
    }

    await resumenCuentaService.actualizarSaldoGeneral(
      transaccion.id_usuario,
      -montoTransaccion,
      t
    );
  },

  // =========================================================================
  // FUNCIONES PRIVADAS
  // =========================================================================

  async _generarPreferenciaPago(transaccion, metodo) {
    if (metodo !== "mercadopago") {
      throw new Error("Solo mercadopago está soportado actualmente");
    }

    const datosPreferencia = this._construirDatosPreferencia(transaccion);

    return await paymentService.createPaymentSession(
      datosPreferencia,
      transaccion.id
    );
  },

  _construirDatosPreferencia(transaccion) {
    const { tipo_transaccion, id } = transaccion;

    let titulo = "";
    switch (tipo_transaccion) {
      case "directo":
        titulo = `Inversión Directa #${transaccion.id_inversion}`;
        break;
      case "Puja":
        titulo = `Pago Puja Ganadora #${transaccion.id_puja}`;
        break;
      case "pago_suscripcion_inicial":
        titulo = `Suscripción Inicial - Proyecto #${transaccion.id_proyecto}`;
        break;
      case "mensual":
        titulo = `Pago Mensual - Suscripción #${transaccion.id_suscripcion}`;
        break;
      default:
        titulo = `Transacción #${id}`;
    }

    return {
      id: id,
      id_usuario: transaccion.id_usuario,
      monto: transaccion.monto,
      id_proyecto: transaccion.id_proyecto,
      titulo: titulo,
    };
  },

  _validarDatosTransaccion(data) {
    const { tipo_transaccion, id_inversion, id_puja, id_suscripcion } = data;

    switch (tipo_transaccion) {
      case "directo":
        if (!id_inversion) {
          throw new Error("Transacción 'directo' requiere id_inversion");
        }
        break;
      case "Puja":
        if (!id_puja) {
          throw new Error("Transacción 'Puja' requiere id_puja");
        }
        break;
      case "mensual":
        if (!id_suscripcion && !data.id_pago_mensual) {
          throw new Error(
            "Transacción 'mensual' requiere id_suscripcion o id_pago_mensual"
          );
        }
        break;
      case "pago_suscripcion_inicial":
        if (!data.id_proyecto || !data.id_pago_mensual) {
          throw new Error(
            "Transacción 'pago_suscripcion_inicial' requiere id_proyecto y id_pago_mensual"
          );
        }
        break;
      default:
        throw new Error(
          `Tipo de transacción no reconocido: ${tipo_transaccion}`
        );
    }
  },

  // =========================================================================
  // FUNCIONES DE ACCESO BÁSICO
  // =========================================================================

  async create(data, options = {}) {
    return Transaccion.create(data, options);
  },

  async findOneByPagoIdMensual(id_pago, options = {}) {
    return Transaccion.findOne({
      where: { id_pago_mensual: id_pago },
      ...options,
    });
  },

  async findByUserId(userId, options = {}) {
    try {
      return await Transaccion.findAll({
        where: {
          id_usuario: userId,
        },
        ...options,
      });
    } catch (error) {
      throw new Error("Error al obtener transacciones por ID de usuario.");
    }
  },

  async findAll() {
    try {
      return await Transaccion.findAll();
    } catch (error) {
      throw new Error("Error al obtener transacciones.");
    }
  },

  async findById(id) {
    try {
      return await Transaccion.findByPk(id);
    } catch (error) {
      throw new Error("Error al buscar transacción por ID.");
    }
  },

  async softDelete(id) {
    try {
      const transaccion = await Transaccion.findByPk(id);
      if (!transaccion) return null;
      transaccion.estado = "eliminada";
      await transaccion.save();
      return transaccion;
    } catch (error) {
      throw new Error("Error al eliminar transacción.");
    }
  },

  /**
   * @async
   * @function verificarYExpirarTransaccionAntigua
   * @description Verifica si una transacción pendiente/fallida es muy antigua y la marca como expirada
   * @param {Transaccion} transaccion - Instancia de la transacción
   * @param {Object} t - Transacción de Sequelize
   * @returns {Promise<boolean>} true si la transacción fue expirada, false si aún es válida
   */
  async verificarYExpirarTransaccionAntigua(transaccion, t) {
    const ahora = new Date();
    const fechaCreacion = new Date(transaccion.createdAt);
    const minutosTranscurridos = (ahora - fechaCreacion) / (1000 * 60);

    if (minutosTranscurridos > TRANSACTION_TIMEOUT_MINUTES) {
      console.warn(
        `⏰ Transacción ${
          transaccion.id
        } ha expirado (${minutosTranscurridos.toFixed(1)} min)`
      );

      await transaccion.update(
        {
          estado_transaccion: "expirado",
          error_detalle: `Transacción expirada tras ${TRANSACTION_TIMEOUT_MINUTES} minutos sin confirmación`,
        },
        { transaction: t }
      );

      return true; // Transacción expirada
    }

    return false; // Transacción aún válida
  },

  /**
   * @async
   * @function confirmarTransaccion (MODIFICADO)
   * @description Confirma una transacción CON VALIDACIÓN DE TIMEOUT
   */
  async confirmarTransaccion(transaccionId, options = {}) {
    const t = options.transaction;

    if (!t) {
      throw new Error(
        "Se requiere una transacción (t) activa para confirmarTransaccion."
      );
    }

    let transaccion;

    try {
      transaccion = await Transaccion.findByPk(transaccionId, {
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      if (
        transaccion.tipo_transaccion === "directo" &&
        transaccion.id_proyecto
      ) {
        const proyecto = await Proyecto.findByPk(transaccion.id_proyecto, {
          transaction: t,
        });

        if (!proyecto) {
          throw new Error(`Proyecto ${transaccion.id_proyecto} no encontrado.`);
        }

        // ✅ Verificar si el proyecto sigue abierto para inversiones
        if (
          proyecto.estado_proyecto === "Finalizado" ||
          proyecto.estado_proyecto === "Cancelado"
        ) {
          await transaccion.update(
            {
              estado_transaccion: "rechazado_proyecto_cerrado",
              error_detalle: `El proyecto está en estado: ${proyecto.estado_proyecto}`,
            },
            { transaction: t }
          );

          throw new Error(
            `El proyecto "${proyecto.nombre_proyecto}" ya no está disponible para inversión (${proyecto.estado_proyecto}). Pago rechazado.`
          );
        }
      }
      if (!transaccion) {
        throw new Error("Transacción no encontrada.");
      }

      // ✅ IDEMPOTENCIA: Si ya está pagada, retornar
      if (transaccion.estado_transaccion === "pagado") {
        console.log(
          `✅ Transacción ${transaccionId} ya está pagada. Retornando.`
        );
        return transaccion;
      }

      // 🚫 BLOQUEAR transacciones revertidas
      if (transaccion.estado_transaccion === "revertido") {
        throw new Error(
          `Transacción ${transaccionId} ya fue revertida. No se puede confirmar.`
        );
      }

      // ⏰ VALIDACIÓN CRÍTICA: Verificar si la transacción expiró
      const haExpirado = await this.verificarYExpirarTransaccionAntigua(
        transaccion,
        t
      );

      if (haExpirado) {
        throw new Error(
          `Transacción ${transaccionId} expiró. El pago fue rechazado automáticamente por timeout.`
        );
      }

      // 🔍 VALIDACIÓN ADICIONAL: Para suscripciones, verificar capacidad del proyecto
      if (
        transaccion.tipo_transaccion === "pago_suscripcion_inicial" &&
        transaccion.id_proyecto
      ) {
        const proyecto = await Proyecto.findByPk(transaccion.id_proyecto, {
          transaction: t,
        });

        if (!proyecto) {
          throw new Error(`Proyecto ${transaccion.id_proyecto} no encontrado.`);
        }

        // ✅ Verificar si hay capacidad disponible
        if (proyecto.suscripciones_actuales >= proyecto.obj_suscripciones) {
          // Marcar como rechazado por capacidad
          await transaccion.update(
            {
              estado_transaccion: "rechazado_por_capacidad",
              error_detalle: `El proyecto "${proyecto.nombre_proyecto}" ya alcanzó su capacidad máxima (${proyecto.obj_suscripciones}/${proyecto.obj_suscripciones})`,
            },
            { transaction: t }
          );

          throw new Error(
            `El proyecto "${proyecto.nombre_proyecto}" ya no tiene cupos disponibles. Pago rechazado.`
          );
        }

        // ✅ Verificar si el proyecto sigue abierto
        if (
          proyecto.estado_proyecto === "Finalizado" ||
          proyecto.estado_proyecto === "Cancelado"
        ) {
          await transaccion.update(
            {
              estado_transaccion: "rechazado_proyecto_cerrado",
              error_detalle: `El proyecto está en estado: ${proyecto.estado_proyecto}`,
            },
            { transaction: t }
          );

          throw new Error(
            `El proyecto "${proyecto.nombre_proyecto}" ya no está disponible (${proyecto.estado_proyecto}). Pago rechazado.`
          );
        }
      }

      // Log si estamos recuperando una transacción fallida
      if (transaccion.estado_transaccion === "fallido") {
        console.log(
          `⚠️ Recuperando transacción ${transaccionId} desde estado 'fallido' debido a aprobación de MP.`
        );
      }

      const montoTransaccion = toFloat(transaccion.monto);

      // Switch de lógica de negocio según el tipo de transacción
      switch (transaccion.tipo_transaccion) {
        case "pago_suscripcion_inicial":
          await this.manejarPagoSuscripcionInicial(
            transaccion,
            montoTransaccion,
            t
          );
          break;

        case "mensual":
          await this.manejarPagoMensual(transaccion, montoTransaccion, t);
          break;

        case "directo":
          if (!transaccion.id_inversion) {
            throw new Error("Transacción 'directo' sin ID de inversión.");
          }
          await inversionService.confirmarInversion(
            transaccion.id_inversion,
            t
          );
          await resumenCuentaService.actualizarSaldoGeneral(
            transaccion.id_usuario,
            -montoTransaccion,
            t
          );
          break;

        case "Puja":
          if (!transaccion.id_puja) {
            throw new Error("Transacción 'Puja' sin ID de puja.");
          }
          await pujaService.procesarPujaGanadora(transaccion.id_puja, t);
          await resumenCuentaService.actualizarSaldoGeneral(
            transaccion.id_usuario,
            -montoTransaccion,
            t
          );
          break;

        default:
          throw new Error(
            `Tipo de transacción no reconocido: ${transaccion.tipo_transaccion}`
          );
      }

      // Si toda la lógica de negocio fue exitosa, actualiza el estado final
      await transaccion.update(
        {
          estado_transaccion: "pagado",
          fecha_transaccion: new Date(),
        },
        { transaction: t }
      );

      console.log(`✅ Transacción ${transaccionId} confirmada exitosamente.`);
      return transaccion;
    } catch (error) {
      console.error(
        `Error al procesar la lógica de negocio de la transacción ${transaccionId}: ${error.message}`
      );

      throw new Error(
        `Error en el procesamiento de confirmación: ${error.message}`
      );
    }
  },
};

module.exports = transaccionService;
