// Archivo: services/transaccion.service.js
// VERSIÓN COMPLETA

const { sequelize } = require("../config/database");
const { Op } = require("sequelize");
const Transaccion = require("../models/transaccion");
const Pago = require("../models/pago");
const PagoMercado = require("../models/pagoMercado");
const SuscripcionProyecto = require("../models/suscripcion_proyecto");
const Proyecto = require("../models/proyecto");
const Inversion = require("../models/inversion");
const Puja = require("../models/puja");

// Servicios externos
const paymentService = require("./pagoMercado.service");
const inversionService = require("./inversion.service");
const pagoService = require("./pago.service");
const suscripcionService = require("./suscripcion_proyecto.service");
const resumenCuentaService = require("./resumen_cuenta.service");

// Helper para asegurar el tipo de dato numérico
const toFloat = (value) => parseFloat(value);
const TRANSACTION_TIMEOUT_MINUTES = 30;

const transaccionService = {
  // =========================================================================
  // NUEVO FLUJO: Generar Checkout para una Transacción YA CREADA
  // =========================================================================

  async generarCheckoutParaTransaccionExistente(
    transaccion,
    metodo = "mercadopago",
    options = {},
  ) {
    const t = options.transaction;
    if (!t) {
      throw new Error(
        "Se requiere una transacción de BD activa (options.transaction)",
      );
    }

    if (
      transaccion.estado_transaccion !== "pendiente" &&
      transaccion.estado_transaccion !== "fallido"
    ) {
      throw new Error(
        `La Transacción #${transaccion.id} ya fue procesada o está en estado: ${transaccion.estado_transaccion}.`,
      );
    }

    const { preferenceId, redirectUrl } = await this._generarPreferenciaPago(
      transaccion,
      metodo,
    );

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

    if (!created) {
      await pagoMercado.update(
        {
          monto_pagado: transaccion.monto,
          id_transaccion_pasarela: preferenceId,
          estado: "pendiente",
        },
        { transaction: t },
      );
    }

    await transaccion.update(
      { id_pago_pasarela: pagoMercado.id, estado_transaccion: "pendiente" },
      { transaction: t },
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
    options = {},
  ) {
    const t = options.transaction;
    if (!t) {
      throw new Error(
        "Se requiere una transacción de BD activa (options.transaction)",
      );
    }

    this._validarDatosTransaccion(data);

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
      { transaction: t },
    );

    return this.generarCheckoutParaTransaccionExistente(
      transaccion,
      "mercadopago",
      options,
    );
  },

  // =========================================================================
  // LÓGICA DE CONFIRMACIÓN Y REVERSIÓN
  // =========================================================================

  async procesarFalloTransaccion(
    transaccionId,
    targetStatus = "fallido",
    errorDetail = "Transacción fallida por pasarela de pago.",
    options = {},
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

      if (
        transaccion.estado_transaccion === "pagado" ||
        transaccion.estado_transaccion === "revertido"
      ) {
        if (isNewTransaction) await t.commit();
        return transaccion;
      }

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

      await transaccion.update(
        {
          estado_transaccion: targetStatus,
          fecha_transaccion: new Date(),
          error_detalle: errorDetail,
        },
        { transaction: t },
      );

      console.log(
        `✅ Transacción ${transaccionId} marcada como '${targetStatus}'.`,
      );

      if (isNewTransaction) await t.commit();
      return transaccion;
    } catch (error) {
      console.error(
        `Error al procesar la falla de la transacción ${transaccionId}: ${error.message}`,
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

      if (transaccion.estado_transaccion === "pendiente") {
        await transaccion.update(
          {
            estado_transaccion: "fallido",
            error_detalle:
              "Operación cancelada por el usuario en la pasarela de pago.",
          },
          { transaction: t },
        );
        console.log(
          `❌ Transacción ${transaccionId} marcada como 'fallido' por cancelación de usuario.`,
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
        error.message,
      );
      throw error;
    }
  },

  // =========================================================================
  // FUNCIÓN DE INICIO (CON VALIDACIONES ANTI-DUPLICACIÓN)
  // =========================================================================

  async iniciarTransaccionYCheckout(modelo, modeloId, userId) {
    const t = await sequelize.transaction();
    try {
      let entidadBase;
      let datosTransaccion = { id_usuario: userId, monto: 0 };

      switch (modelo.toLowerCase()) {
        case "inversion":
          entidadBase = await Inversion.findOne({
            where: { id: modeloId, id_usuario: userId, estado: "pendiente" },
            transaction: t,
          });
          if (!entidadBase) {
            throw new Error(
              `Inversión ${modeloId} no encontrada, no te pertenece o ya está pagada.`,
            );
          }

          const transaccionInversionExistente = await Transaccion.findOne({
            where: {
              id_inversion: modeloId,
              tipo_transaccion: "directo",
              estado_transaccion: { [Op.in]: ["pagado", "en_proceso"] }
            },
            transaction: t
          });

          if (transaccionInversionExistente) {
            throw new Error(
              `❌ La inversión ID ${modeloId} ya tiene una transacción en estado '${transaccionInversionExistente.estado_transaccion}'. No se puede iniciar un nuevo pago.`
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
          const pujaServiceLocal = require("./puja.service");
          entidadBase = await pujaServiceLocal.getValidPaymentDetails(
            modeloId,
            userId,
            { transaction: t },
          );
          const montoPujaPagar = toFloat(entidadBase.monto_puja);

          const transaccionPujaExistente = await Transaccion.findOne({
            where: {
              id_puja: modeloId,
              tipo_transaccion: "Puja",
              estado_transaccion: { [Op.in]: ["pagado", "en_proceso"] }
            },
            transaction: t
          });

          if (transaccionPujaExistente) {
            throw new Error(
              `❌ La puja ID ${modeloId} ya tiene una transacción en estado '${transaccionPujaExistente.estado_transaccion}'. No se puede iniciar un nuevo pago.`
            );
          }

          if (entidadBase.estado_puja === "ganadora_pagada") {
            throw new Error(
              `❌ La puja ID ${modeloId} ya está marcada como 'ganadora_pagada'. No se puede pagar nuevamente.`
            );
          }

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
              `Pago ${modeloId} no encontrado, no te pertenece o ya está pagado.`,
            );
          }

          const transaccionPagoExistente = await Transaccion.findOne({
            where: {
              id_pago_mensual: modeloId,
              estado_transaccion: { [Op.in]: ["pagado", "en_proceso"] }
            },
            transaction: t
          });

          if (transaccionPagoExistente) {
            throw new Error(
              `❌ El pago mensual ID ${modeloId} ya tiene una transacción en estado '${transaccionPagoExistente.estado_transaccion}'. No se puede iniciar un nuevo pago.`
            );
          }

          if (entidadBase.estado_pago === "pagado" || entidadBase.estado_pago === "cubierto_por_puja") {
            throw new Error(
              `❌ El pago mensual ID ${modeloId} ya está marcado como '${entidadBase.estado_pago}'. No se puede pagar nuevamente.`
            );
          }

          let idProyecto = entidadBase.id_proyecto;

          if (!idProyecto && entidadBase.suscripcion) {
            idProyecto = entidadBase.suscripcion.id_proyecto;
            await entidadBase.update(
              { id_proyecto: idProyecto },
              { transaction: t },
            );
          }

          if (!idProyecto) {
            throw new Error(
              `Pago ${modeloId} no tiene id_proyecto asociado.`,
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
          },
        );

        resultadoCheckout = await this.crearTransaccionConCheckout(
          datosTransaccion,
          "mercadopago",
          { transaction: t },
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
            `Transacción pendiente/fallida #${existingTransaccion.id} encontrada. Regenerando checkout...`,
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
              { transaction: t },
            );
          }

          resultadoCheckout =
            await this.generarCheckoutParaTransaccionExistente(
              existingTransaccion,
              "mercadopago",
              { transaction: t },
            );
        } else {
          resultadoCheckout = await this.crearTransaccionConCheckout(
            datosTransaccion,
            "mercadopago",
            { transaction: t },
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
        t,
      );

    if (!nuevaSuscripcion || !proyecto) {
      throw new Error("Error al crear suscripción.");
    }

    await pagoToUpdate.update(
      { id_suscripcion: nuevaSuscripcion.id },
      { transaction: t },
    );

    await transaccion.update(
      { id_suscripcion: nuevaSuscripcion.id },
      { transaction: t },
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
      { transaction: t },
    );
    await resumenCuentaService.updateAccountSummaryOnPayment(
      nuevaSuscripcion.id,
      { transaction: t },
    );
    await resumenCuentaService.actualizarSaldoGeneral(
      transaccion.id_usuario,
      -montoTransaccion,
      t,
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
        "Pago o ID de suscripción no encontrada en el modelo Pago.",
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
      t,
    );
  },

  // =========================================================================
  // FUNCIÓN PRINCIPAL DE CONFIRMACIÓN (CON VALIDACIÓN ANTI-DUPLICACIÓN)
  // =========================================================================

  async confirmarTransaccion(transaccionId, options = {}) {
    const t = options.transaction;

    if (!t) {
      throw new Error(
        "Se requiere una transacción (t) activa para confirmarTransaccion.",
      );
    }

    let transaccion;

    try {
      transaccion = await Transaccion.findByPk(transaccionId, {
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      if (!transaccion) {
        throw new Error("Transacción no encontrada.");
      }

      if (transaccion.estado_transaccion === "pagado") {
        console.log(`✅ Transacción ${transaccionId} ya está pagada. Retornando.`);
        return transaccion;
      }

      if (transaccion.estado_transaccion === "revertido") {
        throw new Error(
          `Transacción ${transaccionId} ya fue revertida. No se puede confirmar.`,
        );
      }

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

        if (
          proyecto.estado_proyecto === "Finalizado" ||
          proyecto.estado_proyecto === "Cancelado"
        ) {
          await transaccion.update(
            {
              estado_transaccion: "rechazado_proyecto_cerrado",
              error_detalle: `El proyecto está en estado: ${proyecto.estado_proyecto}`,
            },
            { transaction: t },
          );

          throw new Error(
            `El proyecto "${proyecto.nombre_proyecto}" ya no está disponible para inversión.`,
          );
        }
      }

      const haExpirado = await this.verificarYExpirarTransaccionAntigua(
        transaccion,
        t,
      );

      if (haExpirado) {
        throw new Error(
          `Transacción ${transaccionId} expiró. El pago fue rechazado automáticamente por timeout.`,
        );
      }

      // 🔥 VALIDACIÓN ANTI-DUPLICACIÓN
      await this._validarEntidadSinPagoPrevisto(transaccion, t);

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

        if (proyecto.suscripciones_actuales >= proyecto.obj_suscripciones) {
          await transaccion.update(
            {
              estado_transaccion: "rechazado_por_capacidad",
              error_detalle: `El proyecto "${proyecto.nombre_proyecto}" ya alcanzó su capacidad máxima`,
            },
            { transaction: t },
          );

          throw new Error(
            `El proyecto "${proyecto.nombre_proyecto}" ya no tiene cupos disponibles.`,
          );
        }

        if (
          proyecto.estado_proyecto === "Finalizado" ||
          proyecto.estado_proyecto === "Cancelado"
        ) {
          await transaccion.update(
            {
              estado_transaccion: "rechazado_proyecto_cerrado",
              error_detalle: `El proyecto está en estado: ${proyecto.estado_proyecto}`,
            },
            { transaction: t },
          );

          throw new Error(
            `El proyecto "${proyecto.nombre_proyecto}" ya no está disponible.`,
          );
        }
      }

      if (transaccion.estado_transaccion === "fallido") {
        console.log(
          `⚠️ Recuperando transacción ${transaccionId} desde estado 'fallido'.`,
        );
      }

      const montoTransaccion = toFloat(transaccion.monto);

      switch (transaccion.tipo_transaccion) {
        case "pago_suscripcion_inicial":
          await this.manejarPagoSuscripcionInicial(
            transaccion,
            montoTransaccion,
            t,
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
            t,
          );
          await resumenCuentaService.actualizarSaldoGeneral(
            transaccion.id_usuario,
            -montoTransaccion,
            t,
          );
          break;

        case "Puja":
          if (!transaccion.id_puja) {
            throw new Error("Transacción 'Puja' sin ID de puja.");
          }
          const pujaService = require("./puja.service");
          await pujaService.procesarPujaGanadora(transaccion.id_puja, t);
          await resumenCuentaService.actualizarSaldoGeneral(
            transaccion.id_usuario,
            -montoTransaccion,
            t,
          );
          break;

        default:
          throw new Error(
            `Tipo de transacción no reconocido: ${transaccion.tipo_transaccion}`,
          );
      }

      await transaccion.update(
        {
          estado_transaccion: "pagado",
          fecha_transaccion: new Date(),
        },
        { transaction: t },
      );

      console.log(`✅ Transacción ${transaccionId} confirmada exitosamente.`);
      return transaccion;
    } catch (error) {
      console.error(
        `Error al procesar la lógica de negocio de la transacción ${transaccionId}: ${error.message}`,
      );

      if (error.message.includes("ya tiene una transacción pagada") ||
          error.message.includes("ya está marcada como")) {
        try {
          await transaccion.update(
            {
              estado_transaccion: "fallido",
              error_detalle: error.message,
            },
            { transaction: t },
          );
        } catch (updateError) {
          console.error("Error al marcar transacción como fallida:", updateError.message);
        }
      }

      throw new Error(
        `Error en el procesamiento de confirmación: ${error.message}`,
      );
    }
  },

  async _validarEntidadSinPagoPrevisto(transaccion, t) {
    const { tipo_transaccion, id_inversion, id_puja, id_pago_mensual, id } = transaccion;
    
    let whereCondition = null;
    let entidadNombre = "";
    let entidadId = null;

    switch (tipo_transaccion) {
      case "directo":
        if (!id_inversion) return;
        whereCondition = { id_inversion, tipo_transaccion: "directo" };
        entidadNombre = "inversión";
        entidadId = id_inversion;
        break;
        
      case "Puja":
        if (!id_puja) return;
        whereCondition = { id_puja, tipo_transaccion: "Puja" };
        entidadNombre = "puja";
        entidadId = id_puja;
        break;
        
      case "pago_suscripcion_inicial":
      case "mensual":
        if (!id_pago_mensual) return;
        whereCondition = { id_pago_mensual };
        entidadNombre = "pago mensual";
        entidadId = id_pago_mensual;
        break;
        
      default:
        return;
    }

    const transaccionExistente = await Transaccion.findOne({
      where: {
        ...whereCondition,
        id: { [Op.ne]: id },
        estado_transaccion: {
          [Op.in]: ["pagado", "en_proceso"]
        }
      },
      transaction: t,
      lock: t.LOCK.UPDATE
    });

    if (transaccionExistente) {
      const errorMsg = `❌ La ${entidadNombre} ID ${entidadId} ya tiene una transacción pagada (ID: ${transaccionExistente.id}). No se puede procesar un segundo pago.`;
      console.error(errorMsg);
      throw new Error(errorMsg);
    }

    if (tipo_transaccion === "Puja" && id_puja) {
      const puja = await Puja.findByPk(id_puja, {
        transaction: t,
        attributes: ["estado_puja", "id"]
      });
      
      if (puja && puja.estado_puja === "ganadora_pagada") {
        const errorMsg = `❌ La puja ID ${id_puja} ya está marcada como 'ganadora_pagada'. No se puede procesar un segundo pago.`;
        console.error(errorMsg);
        throw new Error(errorMsg);
      }
    }

    if (tipo_transaccion === "directo" && id_inversion) {
      const inversion = await Inversion.findByPk(id_inversion, {
        transaction: t,
        attributes: ["estado", "id"]
      });
      
      if (inversion && inversion.estado === "pagado") {
        const errorMsg = `❌ La inversión ID ${id_inversion} ya está marcada como 'pagado'. No se puede procesar un segundo pago.`;
        console.error(errorMsg);
        throw new Error(errorMsg);
      }
    }

    if ((tipo_transaccion === "pago_suscripcion_inicial" || tipo_transaccion === "mensual") && id_pago_mensual) {
      const pago = await Pago.findByPk(id_pago_mensual, {
        transaction: t,
        attributes: ["estado_pago", "id"]
      });
      
      if (pago && (pago.estado_pago === "pagado" || pago.estado_pago === "cubierto_por_puja")) {
        const errorMsg = `❌ El pago mensual ID ${id_pago_mensual} ya está marcado como '${pago.estado_pago}'. No se puede procesar un segundo pago.`;
        console.error(errorMsg);
        throw new Error(errorMsg);
      }
    }

    console.log(`✅ Validación superada: La ${entidadNombre} ID ${entidadId} no tiene pagos previos.`);
  },

  async verificarYExpirarTransaccionAntigua(transaccion, t) {
    const ahora = new Date();
    const fechaCreacion = new Date(transaccion.createdAt);
    const minutosTranscurridos = (ahora - fechaCreacion) / (1000 * 60);

    if (minutosTranscurridos > TRANSACTION_TIMEOUT_MINUTES) {
      console.warn(
        `⏰ Transacción ${transaccion.id} ha expirada (${minutosTranscurridos.toFixed(1)} min)`,
      );

      await transaccion.update(
        {
          estado_transaccion: "expirado",
          error_detalle: `Transacción expirada tras ${TRANSACTION_TIMEOUT_MINUTES} minutos sin confirmación`,
        },
        { transaction: t },
      );

      return true;
    }

    return false;
  },

  // =========================================================================
  // FUNCIONES PRIVADAS
  // =========================================================================

  async _generarPreferenciaPago(transaccion, metodo) {
    if (metodo !== "mercadopago") {
      throw new Error("Solo mercadopago está soportado actualmente");
    }

    const datosPreferencia = await this._construirDatosPreferencia(transaccion);

    console.log("📋 Datos de preferencia construidos:", {
      monto: datosPreferencia.monto,
      titulo: datosPreferencia.titulo,
      id_usuario: datosPreferencia.id_usuario,
    });

    return await paymentService.createPaymentSession(
      datosPreferencia,
      transaccion.id,
    );
  },

  async _construirDatosPreferencia(transaccion) {
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

    if (!transaccion.monto) {
      throw new Error(`Transacción ${id} no tiene monto definido`);
    }

    const montoNumerico = parseFloat(transaccion.monto);

    if (isNaN(montoNumerico) || montoNumerico <= 0) {
      throw new Error(
        `Monto inválido en transacción ${id}: ${transaccion.monto}`,
      );
    }

    const User = require("../models/usuario");
    const usuario = await User.findByPk(transaccion.id_usuario, {
      attributes: ["nombre", "apellido", "email", "numero_telefono", "dni"],
    });

    if (!usuario) {
      console.warn(
        `⚠️ Usuario ${transaccion.id_usuario} no encontrado, continuando sin datos personales`,
      );
    }

    return {
      id: id,
      id_usuario: transaccion.id_usuario,
      monto: montoNumerico,
      id_proyecto: transaccion.id_proyecto,
      titulo: titulo,
      tipo_transaccion: tipo_transaccion,
      nombre_usuario: usuario?.nombre,
      apellido_usuario: usuario?.apellido,
      email_usuario: usuario?.email,
      telefono: usuario?.numero_telefono,
      documento: usuario?.dni,
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
            "Transacción 'mensual' requiere id_suscripcion o id_pago_mensual",
          );
        }
        break;
      case "pago_suscripcion_inicial":
        if (!data.id_proyecto || !data.id_pago_mensual) {
          throw new Error(
            "Transacción 'pago_suscripcion_inicial' requiere id_proyecto y id_pago_mensual",
          );
        }
        break;
      default:
        throw new Error(
          `Tipo de transacción no reconocido: ${tipo_transaccion}`,
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

  async findAll() {
    try {
      const Usuario = require("../models/usuario");
      const Proyecto = require("../models/proyecto");
      const Inversion = require("../models/inversion");
      const Pago = require("../models/pago");
      const SuscripcionProyecto = require("../models/suscripcion_proyecto");
      const Puja = require("../models/puja");
      const PagoMercado = require("../models/pagoMercado");

      return await Transaccion.findAll({
        attributes: [
          "id",
          "tipo_transaccion",
          "monto",
          "fecha_transaccion",
          "id_usuario",
          "id_proyecto",
          "id_pago_mensual",
          "id_pago_pasarela",
          "id_inversion",
          "id_puja",
          "estado_transaccion",
          "createdAt",
          "updatedAt",
        ],
        include: [
          {
            model: Usuario,
            as: "usuario",
            attributes: ["id", "nombre", "apellido", "email", "dni"],
          },
          {
            model: Proyecto,
            as: "proyectoTransaccion",
            attributes: [
              "id",
              "nombre_proyecto",
              "tipo_inversion",
              "estado_proyecto",
              "moneda",
            ],
          },
          {
            model: Inversion,
            as: "inversion",
            attributes: ["id", "monto", "estado"],
            required: false,
          },
          {
            model: Pago,
            as: "pagoMensual",
            attributes: [
              "id",
              "monto",
              "estado_pago",
              "fecha_vencimiento",
              "id_suscripcion",
              "id_usuario",
              "id_proyecto",
            ],
            required: false,
          },
          {
            model: SuscripcionProyecto,
            as: "suscripcion",
            attributes: [
              "id",
              "monto_total_pagado",
              "meses_a_pagar",
              "tokens_disponibles",
              "saldo_a_favor",
              "id_usuario",
              "id_proyecto",
            ],
            required: false,
          },
          {
            model: Puja,
            as: "puja",
            attributes: [
              "id",
              "monto_puja",
              "estado_puja",
              "fecha_puja",
              "id_suscripcion",
            ],
            required: false,
          },
          {
            model: PagoMercado,
            as: "pagoPasarela",
            attributes: [
              "id",
              "monto_pagado",
              "metodo_pasarela",
              "estado",
              "id_transaccion_pasarela",
            ],
            required: false,
          },
        ],
        order: [["createdAt", "DESC"]],
      });
    } catch (error) {
      console.error("Error al obtener transacciones con includes:", error);
      throw new Error("Error al obtener transacciones.");
    }
  },

  async findByUserId(userId, options = {}) {
    try {
      const Usuario = require("../models/usuario");
      const Proyecto = require("../models/proyecto");
      const Inversion = require("../models/inversion");
      const Pago = require("../models/pago");
      const SuscripcionProyecto = require("../models/suscripcion_proyecto");
      const Puja = require("../models/puja");
      const PagoMercado = require("../models/pagoMercado");

      return await Transaccion.findAll({
        where: {
          id_usuario: userId,
        },
        attributes: [
          "id",
          "tipo_transaccion",
          "monto",
          "fecha_transaccion",
          "id_usuario",
          "id_proyecto",
          "id_pago_mensual",
          "id_pago_pasarela",
          "id_inversion",
          "id_puja",
          "estado_transaccion",
          "createdAt",
          "updatedAt",
        ],
        include: [
          {
            model: Usuario,
            as: "usuario",
            attributes: ["id", "nombre", "apellido", "email"],
          },
          {
            model: Proyecto,
            as: "proyectoTransaccion",
            attributes: [
              "id",
              "nombre_proyecto",
              "tipo_inversion",
              "estado_proyecto",
              "moneda",
            ],
          },
          {
            model: Inversion,
            as: "inversion",
            attributes: ["id", "monto", "estado"],
            required: false,
          },
          {
            model: Pago,
            as: "pagoMensual",
            attributes: [
              "id",
              "monto",
              "estado_pago",
              "fecha_vencimiento",
              "id_suscripcion",
              "id_usuario",
              "id_proyecto",
              "mes",
            ],
            required: false,
          },
          {
            model: SuscripcionProyecto,
            as: "suscripcion",
            attributes: [
              "id",
              "monto_total_pagado",
              "meses_a_pagar",
              "tokens_disponibles",
              "saldo_a_favor",
              "id_usuario",
              "id_proyecto",
            ],
            required: false,
          },
          {
            model: Puja,
            as: "puja",
            attributes: [
              "id",
              "monto_puja",
              "estado_puja",
              "fecha_puja",
              "id_suscripcion",
            ],
            required: false,
          },
          {
            model: PagoMercado,
            as: "pagoPasarela",
            attributes: [
              "id",
              "monto_pagado",
              "metodo_pasarela",
              "estado",
              "id_transaccion_pasarela",
            ],
            required: false,
          },
        ],
        order: [["createdAt", "DESC"]],
        ...options,
      });
    } catch (error) {
      console.error("Error al obtener transacciones por usuario:", error);
      throw new Error("Error al obtener transacciones por ID de usuario.");
    }
  },

  async findById(id) {
    try {
      const Usuario = require("../models/usuario");
      const Proyecto = require("../models/proyecto");
      const Inversion = require("../models/inversion");
      const Pago = require("../models/pago");
      const SuscripcionProyecto = require("../models/suscripcion_proyecto");
      const Puja = require("../models/puja");
      const PagoMercado = require("../models/pagoMercado");

      return await Transaccion.findByPk(id, {
        attributes: [
          "id",
          "tipo_transaccion",
          "monto",
          "fecha_transaccion",
          "id_usuario",
          "id_proyecto",
          "id_pago_mensual",
          "id_pago_pasarela",
          "id_inversion",
          "id_puja",
          "estado_transaccion",
          "createdAt",
          "updatedAt",
        ],
        include: [
          {
            model: Usuario,
            as: "usuario",
            attributes: [
              "id",
              "nombre",
              "apellido",
              "email",
              "dni",
              "numero_telefono",
            ],
          },
          {
            model: Proyecto,
            as: "proyectoTransaccion",
            attributes: [
              "id",
              "nombre_proyecto",
              "tipo_inversion",
              "estado_proyecto",
              "moneda",
              "monto_inversion",
              "plazo_inversion",
            ],
          },
          {
            model: Inversion,
            as: "inversion",
            attributes: ["id", "monto", "estado", "fecha_inversion"],
            required: false,
          },
          {
            model: Pago,
            as: "pagoMensual",
            attributes: [
              "id",
              "monto",
              "estado_pago",
              "fecha_vencimiento",
              "mes",
              "id_suscripcion",
              "id_usuario",
              "id_proyecto",
            ],
            required: false,
          },
          {
            model: SuscripcionProyecto,
            as: "suscripcion",
            attributes: [
              "id",
              "monto_total_pagado",
              "meses_a_pagar",
              "tokens_disponibles",
              "saldo_a_favor",
              "id_usuario",
              "id_proyecto",
            ],
            required: false,
          },
          {
            model: Puja,
            as: "puja",
            attributes: [
              "id",
              "monto_puja",
              "estado_puja",
              "fecha_puja",
              "fecha_vencimiento_pago",
              "id_suscripcion",
            ],
            required: false,
          },
          {
            model: PagoMercado,
            as: "pagoPasarela",
            attributes: [
              "id",
              "monto_pagado",
              "metodo_pasarela",
              "estado",
              "id_transaccion_pasarela",
              "tipo_medio_pago",
              "fecha_aprobacion",
            ],
            required: false,
          },
        ],
      });
    } catch (error) {
      console.error("Error al buscar transacción por ID:", error);
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
};

module.exports = transaccionService;