const { sequelize } = require("../config/database"); // Importación de la instancia de Sequelize
const { Op } = require("sequelize"); // Importación del objeto de Operadores (Op)
const Transaccion = require("../models/transaccion");
const Pago = require("../models/pago");
const PagoMercado = require("../models/pagoMercado");
const paymentService = require("./pagoMercado.service");
const Inversion = require("../models/inversion");

// Servicios de lógica de negocio
const inversionService = require("./inversion.service");
const pagoService = require("../services/pago.service");
const suscripcionService = require("./suscripcion_proyecto.service");
const resumenCuentaService = require("./resumen_cuenta.service");
const pujaService = require("./puja.service");

// Helper para asegurar el tipo de dato numérico
const toFloat = (value) => parseFloat(value);

const transaccionService = {
  // =========================================================================
  // NUEVO FLUJO: Generar Checkout para una Transacción YA CREADA
  // =========================================================================

  /**
   * ✨ FUNCIÓN CLAVE DEDICADA: Genera el checkout de pago para una Transacción que ya existe.
   * Asume que la entidad (Inversion, Puja, Pago) y la Transacción ya fueron creadas.
   * * @param {Object} transaccion - Instancia del modelo Transaccion (con ID, monto, tipo, etc.)
   * @param {string} metodo - 'mercadopago' (por ahora solo este)
   * @param {Object} options - Opciones de transacción de BD.
   * @returns {Promise<{transaccion, pagoMercado, redirectUrl}>}
   */
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

    if (
      transaccion.estado_transaccion !== "pendiente" &&
      transaccion.estado_transaccion !== "fallido"
    ) {
      // Permitir regenerar si falló
      throw new Error(
        `La Transacción #${transaccion.id} ya fue procesada o está en estado: ${transaccion.estado_transaccion}.`
      );
    } // 1. Generar preferencia de pago en la pasarela // *Solo se pasa la instancia del modelo Transaccion*

    const { preferenceId, redirectUrl } = await this._generarPreferenciaPago(
      transaccion,
      metodo
    ); // 2. Crear o actualizar registro de PagoMercado

    const [pagoMercado, created] = await PagoMercado.findOrCreate({
      where: { id_transaccion: transaccion.id, metodo_pasarela: metodo },
      defaults: {
        monto_pagado: transaccion.monto, // Usamos el monto de la Transacción
        metodo_pasarela: metodo,
        id_transaccion_pasarela: preferenceId, // ID de Preferencia de MP
        estado: "pendiente",
      },
      transaction: t,
    });

    if (!created) {
      await pagoMercado.update(
        {
          monto_pagado: transaccion.monto,
          id_transaccion_pasarela: preferenceId, // Regenerar preferencia
          estado: "pendiente",
        },
        { transaction: t }
      );
    } // 3. Vincular PagoMercado a Transacción (si aún no lo está o si se regeneró)

    await transaccion.update(
      { id_pago_pasarela: pagoMercado.id, estado_transaccion: "pendiente" },
      { transaction: t }
    );

    return {
      transaccion,
      pagoMercado,
      redirectUrl,
    };
  }, // ========================================================================= // FLUJO ORIGINAL: Crea Transacción y luego su Checkout // =========================================================================
  /**
   * Crea una transacción Y genera el checkout de pago automáticamente (usa el nuevo flujo)
   */ async crearTransaccionConCheckout(
    data,
    metodo = "mercadopago",
    options = {}
  ) {
    const t = options.transaction;
    if (!t) {
      throw new Error(
        "Se requiere una transacción de BD activa (options.transaction)"
      );
    } // Validaciones

    this._validarDatosTransaccion(data); // 1. Crear la transacción (Estado: pendiente, id_pago: null)

    const transaccion = await Transaccion.create(
      {
        tipo_transaccion: data.tipo_transaccion,
        monto: data.monto,
        id_usuario: data.id_usuario,
        id_proyecto: data.id_proyecto || null,
        id_inversion: data.id_inversion || null,
        id_puja: data.id_puja || null,
        id_suscripcion: data.id_suscripcion || null,
        id_pago_mensual: data.id_pago_mensual || null, // 👈 Nuevo campo
        estado_transaccion: "pendiente",
      },
      { transaction: t }
    ); // 2. Llama al nuevo flujo para generar la preferencia y PagoMercado, //    y lo vincula a la transacción recién creada.

    return this.generarCheckoutParaTransaccionExistente(
      transaccion,
      "mercadopago",
      options
    );
  }, // ========================================================================= // LÓGICA DE CONFIRMACIÓN Y REVERSIÓN (Webhook/Operaciones Manuales) // =========================================================================
  /**
   * Función principal para confirmar una transacción (LLAMADA POR EL WEBHOOK EN CASO DE ÉXITO)
   */ async confirmarTransaccion(transaccionId, options = {}) {
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
        lock: t.LOCK.UPDATE, // Lock para evitar procesamiento duplicado
      });

      if (!transaccion) {
        throw new Error("Transacción no encontrada.");
      } // Idempotencia: Si ya está pagada, retornar

      if (transaccion.estado_transaccion === "pagado") {
        return transaccion;
      } // Si falló o fue revertida, no la procesamos nuevamente.

      if (
        transaccion.estado_transaccion === "fallido" ||
        transaccion.estado_transaccion === "revertido"
      ) {
        throw new Error(
          `Transacción ${transaccionId} ya fue marcada como ${transaccion.estado_transaccion}. No se puede confirmar.`
        );
      }

      const montoTransaccion = toFloat(transaccion.monto); // Switch de lógica de negocio según tipo

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
          ); // Actualizar el saldo general (billetera) del usuario.
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
          await pujaService.procesarPujaGanadora(transaccion.id_puja, t); // Actualizar el saldo general (billetera) del usuario.
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
      } // Si toda la lógica de negocio anterior fue exitosa: // 5. Actualizar estado final a 'pagado'

      await transaccion.update(
        {
          estado_transaccion: "pagado",
          fecha_transaccion: new Date(),
        },
        { transaction: t }
      );

      return transaccion;
    } catch (error) {
      // El error se propaga al controlador (pagoMercado.controller.js)
      console.error(
        `Error al procesar la lógica de negocio de la transacción ${transaccionId}: ${error.message}`
      );
      throw new Error(
        `Error en el procesamiento de confirmación: ${error.message}`
      );
    }
  },
  /**
   * 🔄 NUEVA FUNCIÓN CLAVE: Marca la transacción como 'revertido' y revierte la lógica de negocio.
   * Usada para reembolsos, cancelaciones manuales o reversiones de errores.
   * @param {number} transaccionId - ID de la Transacción en nuestra BD.
   * @param {Object} options - Opciones de transacción de BD.
   * @returns {Promise<Transaccion>} La instancia de la transacción actualizada.
   */ async revertirTransaccion(transaccionId, options = {}) {
    const t = options.transaction || (await sequelize.transaction());
    const isNewTransaction = !options.transaction;

    try {
      const transaccion = await Transaccion.findByPk(transaccionId, {
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      if (!transaccion) {
        throw new Error("Transacción no encontrada.");
      } // Idempotencia: Solo revertir si estaba 'pagado'

      if (transaccion.estado_transaccion === "revertido") {
        console.log(
          `Transacción ${transaccionId} ya marcada como 'revertido'. Retornando.`
        );
        if (isNewTransaction) await t.commit();
        return transaccion;
      }

      if (transaccion.estado_transaccion !== "pagado") {
        throw new Error(
          `Solo se pueden revertir transacciones en estado 'pagado'. Estado actual: ${transaccion.estado_transaccion}.`
        );
      }

      const montoTransaccion = toFloat(transaccion.monto); // 1. Switch de Lógica de Negocio INVERSA

      switch (transaccion.tipo_transaccion) {
        case "pago_suscripcion_inicial":
        case "mensual": // Reversión de Pago/Suscripción: Marcar el Pago (Modelo 'Pago') como 'revertido' // Esto requiere que el pagoService tenga una función `markAsReverted`.
          if (!transaccion.id_pago_mensual) {
            throw new Error("Transacción de pago sin ID de pago mensual.");
          }

          await pagoService.markAsReverted(transaccion.id_pago_mensual, t); // Lógica de suscripción (ej. aumentar meses a pagar, o cancelar suscripción)
          if (transaccion.id_suscripcion) {
            // Ejemplo: Llama a un servicio de suscripción para gestionar la reversión.
            await suscripcionService.handleReversion(
              transaccion.id_suscripcion,
              1,
              t
            );
          }
          break;

        case "directo":
          if (!transaccion.id_inversion) {
            throw new Error("Transacción 'directo' sin ID de inversión.");
          } // Revertir Inversión (marcar como cancelada/revertida, liberar cuota de proyecto, etc.)
          await inversionService.revertirInversion(transaccion.id_inversion, t);
          break;

        case "Puja":
          if (!transaccion.id_puja) {
            throw new Error("Transacción 'Puja' sin ID de puja.");
          } // Revertir Puja (marcar como no pagada, liberar lote, etc.)
          await pujaService.revertirPagoPujaGanadora(transaccion.id_puja, t);
          break;

        default:
          throw new Error(
            `Tipo de transacción no reconocido para reversión: ${transaccion.tipo_transaccion}`
          );
      } // 2. Devolver el monto al saldo general (billetera) del usuario (el opuesto a confirmar)

      await resumenCuentaService.actualizarSaldoGeneral(
        transaccion.id_usuario,
        montoTransaccion, // Mismo monto, pero positivo (devolución)
        t
      ); // 3. Actualizar estado final de la Transacción

      await transaccion.update(
        {
          estado_transaccion: "revertido",
          error_detalle:
            "Transacción revertida por operación manual/reembolso.",
          fecha_reversion: new Date(),
        },
        { transaction: t }
      );

      console.log(`✅ Transacción ${transaccionId} marcada como 'revertido'.`);
      if (isNewTransaction) await t.commit();
      return transaccion;
    } catch (error) {
      console.error(
        `Error al revertir la lógica de negocio de la transacción ${transaccionId}: ${error.message}`
      );
      if (isNewTransaction) await t.rollback();
      throw new Error(
        `Error en el procesamiento de reversión: ${error.message}`
      );
    }
  },
  /**
   * 🚨 FUNCIÓN: Marca la transacción como fallida e invoca el manejo de fallo del Pago (Mes 1).
   * Esta función es llamada por el WEBHOOK cuando la pasarela de pago notifica un fallo (rejected, cancelled, etc.).
   * Se mantiene con cambios menores para coherencia.
   */ async fallarTransaccion(transaccionId, options = {}) {
    const t = options.transaction;

    if (!t) {
      throw new Error(
        "Se requiere una transacción (t) activa para fallarTransaccion."
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
      } // Idempotencia: Si ya está en un estado final, retornar

      if (
        transaccion.estado_transaccion !== "pendiente" &&
        transaccion.estado_transaccion !== "fallido"
      ) {
        console.log(
          `Transacción ${transaccionId} ya en estado ${transaccion.estado_transaccion}. No se procesa el fallo.`
        );
        return transaccion;
      } // 1. Manejo de lógica de negocio (solo aplica a Pagos)

      if (
        transaccion.tipo_transaccion === "pago_suscripcion_inicial" ||
        transaccion.tipo_transaccion === "mensual"
      ) {
        const idPagoMensual = transaccion.id_pago_mensual; // 🛑 LÓGICA CLAVE: Llama al servicio de Pago para aplicar el manejo condicional (solo Mes 1 se cancela).
        if (idPagoMensual) {
          await pagoService.handlePaymentFailure(idPagoMensual, t);
        }
      } // Para Inversiones y Pujas, simplemente se mantiene el estado pendiente/vencido en la entidad base. // 2. Actualizar estado final de la Transacción a 'fallido'

      await transaccion.update(
        {
          estado_transaccion: "fallido",
          fecha_transaccion: new Date(),
          error_detalle:
            "Transacción rechazada o fallida por la pasarela de pago.",
        },
        { transaction: t }
      );

      console.log(`✅ Transacción ${transaccionId} marcada como 'fallido'.`);

      return transaccion;
    } catch (error) {
      console.error(
        `Error al procesar la falla de la transacción ${transaccionId}: ${error.message}`
      );
      throw new Error(`Error en el procesamiento de fallo: ${error.message}`);
    }
  },
  /**
   * 🛑 FUNCIÓN: Marca una Transacción como 'fallido' si está 'pendiente' (Cancelación del Usuario).
   * Se mantiene con cambios menores para coherencia.
   */ async cancelarTransaccionPorUsuario(transaccionId) {
    const t = await sequelize.transaction();
    try {
      const transaccion = await Transaccion.findByPk(transaccionId, {
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      if (!transaccion) {
        throw new Error(`Transacción ID ${transaccionId} no encontrada.`);
      } // Solo actualizamos si el estado es 'pendiente'

      if (transaccion.estado_transaccion === "pendiente") {
        // Nota: La lógica de handlePaymentFailure para el Mes 1 se deja para el webhook (fallarTransaccion)
        // porque la cancelación por usuario no siempre significa un fallo irremediable.

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
      } // Si ya estaba pagada, o fallida por webhook, simplemente retornamos

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
  }, // ========================================================================= // FUNCIÓN DE INICIO // =========================================================================
  /**
   * ✨ FUNCIÓN CLAVE: Inicia la Transacción y el Checkout para un Modelo de Negocio pendiente.
   * @param {string} modelo - Nombre del modelo ('inversion', 'puja', 'pago', etc.)
   * @param {number} modeloId - ID del registro en ese modelo.
   * @param {number} userId - ID del usuario.
   * @returns {Promise<{transaccion, pagoMercado, redirectUrl}>}
   */ async iniciarTransaccionYCheckout(modelo, modeloId, userId) {
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
          ); // ✅ CORRECCIÓN CLAVE: Usar el monto_puja de la entidadBase (Puja).
          const montoPujaPagar = toFloat(entidadBase.monto_puja);

          datosTransaccion = {
            ...datosTransaccion,
            tipo_transaccion: "Puja",
            monto: montoPujaPagar, // ✅ ASIGNA EL MONTO CORRECTO (7500.00)
            id_proyecto: entidadBase.lote.id_proyecto,
            id_puja: entidadBase.id,
          };
          break;

        case "pago": // Lógica para pagos mensuales o pagos iniciales de suscripción
          entidadBase = await Pago.findOne({
            where: {
              id: modeloId,
              id_usuario: userId,
              estado_pago: "pendiente",
            },
            transaction: t,
          });
          if (!entidadBase) {
            throw new Error(
              `Pago ${modeloId} no encontrado, no te pertenece o ya está pagado.`
            );
          } // Determinar el tipo de transacción basado en si el Pago tiene una suscripción asociada

          const esPagoMensual = !!entidadBase.id_suscripcion;
          const tipoTransaccion = esPagoMensual
            ? "mensual"
            : "pago_suscripcion_inicial"; // Usar el campo id_pago_mensual

          datosTransaccion = {
            ...datosTransaccion,
            tipo_transaccion: tipoTransaccion,
            monto: toFloat(entidadBase.monto),
            id_proyecto: entidadBase.id_proyecto, // Asumo que el modelo Pago tiene id_proyecto
            id_suscripcion: entidadBase.id_suscripcion || null,
            id_pago_mensual: entidadBase.id, // 👈 Se usa para el Pago Mensual
          };
          break;

        default:
          throw new Error(`Modelo de pago no soportado: ${modelo}`);
      } // 2. LÓGICA DE REINTENTO (EXISTING TRANSACCIÓN)

      let resultadoCheckout;

      // La Puja debe crear siempre una nueva Transacción para asegurar el monto correcto.
      if (modelo.toLowerCase() === "puja") {
        // 2A-PUJA: Anular cualquier transacción antigua (pendiente o fallida) para esta Puja.
        // Esto evita que se use el monto incorrecto de una transacción anterior.
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

        // 2B-PUJA: Crear Transacción (nueva y correcta) y su Checkout.
        resultadoCheckout = await this.crearTransaccionConCheckout(
          datosTransaccion, // ESTOS DATOS YA TIENEN EL MONTO CORRECTO
          "mercadopago",
          { transaction: t }
        );
      } else {
        // Lógica para INVERSIÓN y PAGO (Busca y Reutiliza la existente)

        const whereClause = {
          id_usuario: userId,
          estado_transaccion: {
            [Op.in]: ["pendiente", "fallido"], // Incluir fallido para permitir reintento
          },
        }; // Construir la condición de búsqueda específica

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
          // 2A-GENERAL: Si existe, actualizar con el monto (por si acaso) y regenerar Checkout
          console.log(
            `Transacción pendiente/fallida #${existingTransaccion.id} encontrada. Regenerando checkout...`
          );

          // 🚨 IMPORTANTE: Aseguramos que el monto de la Transacción existente sea el correcto
          // antes de regenerar el Checkout. Esto es clave para Inversión/Pago si el monto pudiera cambiar.
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
          // 2B-GENERAL: Si no existe, crear Transacción y luego su Checkout
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
  }, // ========================================================================= // FUNCIONES ASISTENTES DE LÓGICA DE NEGOCIO // =========================================================================
  /**
   * FUNCIÓN ASISTENTE: Maneja la lógica para el primer pago de una suscripción.
   */ async manejarPagoSuscripcionInicial(transaccion, montoTransaccion, t) {
    if (!transaccion.id_pago_mensual) {
      throw new Error("Transacción 'pago_suscripcion_inicial' sin ID de pago.");
    }
    const idPagoMensual = transaccion.id_pago_mensual; // 1. Buscar el Pago pendiente (sin suscripción asociada todavía)

    const pagoToUpdate = await Pago.findByPk(idPagoMensual, {
      transaction: t,
    });
    if (!pagoToUpdate) {
      throw new Error(`El Pago inicial ID ${idPagoMensual} no fue encontrado.`);
    } // 2. Crear el registro de Suscripción (ENTIDAD PRINCIPAL)

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
    } // 3. Vincular la nueva suscripción al Pago y a la Transacción

    await pagoToUpdate.update(
      { id_suscripcion: nuevaSuscripcion.id },
      { transaction: t }
    );

    await transaccion.update(
      { id_suscripcion: nuevaSuscripcion.id },
      { transaction: t }
    ); // 4. Descontar meses restantes: El _createSubscriptionRecord inicializa el total. // Descontamos el primer mes pagado.

    if (nuevaSuscripcion.meses_a_pagar > 0) {
      // Uso de decrement atómico
      await nuevaSuscripcion.decrement("meses_a_pagar", {
        by: 1,
        transaction: t,
      });
    } // 5. Marcar el Pago (Modelo 'Pago') como pagado.

    await pagoService.markAsPaid(idPagoMensual, t); // 6. Actualizar Resumen de Cuenta

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
  /**
   * FUNCIÓN ASISTENTE: Maneja la lógica para pagos mensuales recurrentes.
   */ async manejarPagoMensual(transaccion, montoTransaccion, t) {
    if (!transaccion.id_pago_mensual) {
      throw new Error("Transacción 'mensual' sin ID de pago.");
    }
    const idPMensual = transaccion.id_pago_mensual; // 1. Marcar el Pago (Modelo 'Pago') como pagado

    await pagoService.markAsPaid(idPMensual, t); // 2. Obtener Suscripción (el id_suscripcion debe estar en el Pago)

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
    } // 3. Actualizar meses restantes (si aplica)

    if (suscripcion.meses_a_pagar > 0) {
      // Uso de decrement atómico
      await suscripcion.decrement("meses_a_pagar", { by: 1, transaction: t });
    } // 4. Actualizar Resumen de Cuenta

    await resumenCuentaService.updateAccountSummaryOnPayment(suscripcion.id, {
      transaction: t,
    });
    await resumenCuentaService.actualizarSaldoGeneral(
      transaccion.id_usuario,
      -montoTransaccion,
      t
    );
  }, // ========================================================================= // FUNCIONES PRIVADAS // =========================================================================
  /**
   * Genera la preferencia de pago en la pasarela. Solo depende del modelo Transaccion.
   */ async _generarPreferenciaPago(transaccion, metodo) {
    if (metodo !== "mercadopago") {
      throw new Error("Solo mercadopago está soportado actualmente");
    } // Construir datos para la preferencia (genérico)

    const datosPreferencia = this._construirDatosPreferencia(transaccion);

    return await paymentService.createPaymentSession(
      datosPreferencia,
      transaccion.id // CRUCIAL: Pasamos el ID de la Transacción como referencia
    );
  },
  /**
   * Construye los datos para la preferencia de pago. Solo depende del modelo Transaccion.
   */ _construirDatosPreferencia(transaccion) {
    const { tipo_transaccion, id } = transaccion; // Título descriptivo según tipo

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
    } // Retorna los datos necesarios para el servicio de Mercado Pago

    return {
      id: id,
      id_usuario: transaccion.id_usuario,
      monto: transaccion.monto,
      id_proyecto: transaccion.id_proyecto,
      titulo: titulo,
    };
  },
  /**
   * Validación de datos según tipo de transacción
   */ _validarDatosTransaccion(data) {
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
          // Si es pago mensual, debe tener suscripción O un pago mensual (en el flujo de generación)
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
  }, // ========================================================================= // FUNCIONES DE ACCESO BÁSICO // =========================================================================
  /**
   * Crea un nuevo registro de transacción (sin checkout)
   */ async create(data, options = {}) {
    return Transaccion.create(data, options);
  },
  /**
   * Función renombrada para buscar por el ID de Pago Mensual
   */ async findOneByPagoIdMensual(id_pago, options = {}) {
    return Transaccion.findOne({
      where: { id_pago_mensual: id_pago }, // 👈 Nuevo campo
      ...options,
    });
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
};

module.exports = transaccionService;
