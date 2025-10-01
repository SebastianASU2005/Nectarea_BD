// services/transaccion.service.js

// Importar los modelos necesarios directamente
const Transaccion = require("../models/transaccion");
const Pago = require("../models/pago");
// ⚠️ NO NECESITAMOS 'sequelize' aquí si la transacción es manejada externamente
// const { sequelize } = require("../config/database");

// Importar servicios (se asume que existen y contienen la lógica necesaria)
const inversionService = require("./inversion.service");
const pagoService = require("./pago.service");
const suscripcionService = require("./suscripcion_proyecto.service");
const resumenCuentaService = require("./resumen_cuenta.service");
const pujaService = require("./puja.service");

// Helper para garantizar que un valor string (decimal) se convierta a number
const toFloat = (value) => parseFloat(value);

const transaccionService = {
  /**
   * Crea un nuevo registro de transacción.
   * @param {object} data - Los datos de la transacción a crear.
   * @param {object} options - Opciones de la base de datos (por ejemplo, transacciones).
   * @returns {Promise<Transaccion>} El registro de la transacción creada.
   */
  async create(data, options = {}) {
    return Transaccion.create(data, options);
  },

  async findOneByPagoId(id_pago, options = {}) {
    return Transaccion.findOne({
      where: {
        id_pago: id_pago,
      },
      ...options,
    });
  },

  /**
   * Función principal para confirmar una transacción, DEBE recibir una transacción activa.
   * @param {number} transaccionId - ID de la transacción a confirmar.
   * @param {object} options - Opciones de la base de datos, DEBE contener { transaction: t }.
   * @returns {Promise<Transaccion>} La transacción actualizada.
   */
  async confirmarTransaccion(transaccionId, options = {}) {
    // ⚠️ CAMBIO CRÍTICO: Obtenemos la transacción del controlador
    const t = options.transaction;

    // Verificación de seguridad: si no hay transacción, lanzamos error
    if (!t) {
      throw new Error(
        "Se requiere una transacción (t) activa para confirmarTransaccion."
      );
    }

    let transaccion; // Declarada aquí para que esté disponible en el catch

    try {
      transaccion = await Transaccion.findByPk(transaccionId, {
        transaction: t,
      });

      if (!transaccion) {
        throw new Error("Transacción no encontrada.");
      }

      // Si la transacción ya ha sido procesada, simplemente retornamos.
      if (transaccion.estado_transaccion === "pagado") {
        // En este caso, no hacemos commit ni rollback, solo retornamos.
        return transaccion;
      }

      // 🚨 PUNTO DE BIFURCACIÓN CENTRAL (SWITCH) 🚨
      const montoTransaccion = toFloat(transaccion.monto);

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

        case "directo": // Lógica para confirmar una inversión directa
          if (!transaccion.id_inversion) {
            throw new Error(
              "Transacción de tipo 'directo' sin ID de inversión."
            );
          }
          // 1. Llama a la lógica específica del servicio de Inversión
          await inversionService.confirmarInversion(
            transaccion.id_inversion,
            t
          );
          // 2. Actualizar el saldo general del usuario tras la inversión (ingreso)
          await resumenCuentaService.actualizarSaldoGeneral(
            transaccion.id_usuario,
            montoTransaccion,
            t
          );
          break;

        case "Puja": // Lógica para confirmar el pago de una Puja Ganadora
          if (!transaccion.id_puja) {
            throw new Error(
              "Transacción de tipo 'puja' sin ID de puja asociada."
            );
          }
          // 1. Llama a la lógica de Puja para procesar el pago y el excedente
          await pujaService.procesarPujaGanadora(transaccion.id_puja, t);
          // 2. Actualizar el saldo general del usuario para reflejar la salida de dinero (egreso)
          await resumenCuentaService.actualizarSaldoGeneral(
            transaccion.id_usuario,
            -montoTransaccion, // Monto negativo para egreso
            t
          );
          break;

        default:
          throw new Error(
            `Tipo de transacción no reconocido: ${transaccion.tipo_transaccion}`
          );
      }

      // Actualizamos el estado de la transacción a 'pagado'
      await transaccion.update(
        {
          estado_transaccion: "pagado",
          fecha_transaccion: new Date(),
        },
        {
          transaction: t,
        }
      );

      // ⚠️ EL COMMIT FINAL DEBE ESTAR EN EL CONTROLADOR
      return transaccion;
    } catch (error) {
      // La lógica del controlador (handleWebhook) ahora se encargará del rollback
      // y de marcar la Transacción como 'fallida' fuera de la transacción 't'.
      // Solo necesitamos loggear y propagar el error.

      // Lógica solicitada: Marcar la Transacción como 'fallida' FUERA de la transacción 't'
      if (transaccion && transaccion.estado_transaccion !== "pagado") {
        try {
          // ⚠️ Importante: usar update sin pasar la transacción 't' para que corra
          // independientemente de la transacción fallida.
          await Transaccion.update(
            {
              estado_transaccion: "fallida",
              error_detalle: error.message,
            },
            { where: { id: transaccionId } }
          );
          console.log(
            `[TRANSACCION ${transaccionId}] Estado actualizado a 'fallida'.`
          );
        } catch (updateError) {
          console.error(
            `ERROR GRAVE: No se pudo marcar la transacción ${transaccionId} como 'fallida'.`,
            updateError
          );
        }
      }

      // Se propaga el error original (el que causó la falla inicial)
      throw new Error(`Error al confirmar la transacción: ${error.message}`);
    }
  },
  /**
   * FUNCIÓN ASISTENTE: Maneja la lógica para el primer pago de una suscripción.
   */
  async manejarPagoSuscripcionInicial(transaccion, montoTransaccion, t) {
    if (!transaccion.id_pago) {
      throw new Error(
        "Transacción de tipo 'pago_suscripcion_inicial' sin ID de pago."
      );
    }
    // 1. Marca el Pago asociado como pagado
    await pagoService.markAsPaid(transaccion.id_pago, t);
    // 2. Crea el registro de Suscripción y obtiene el proyecto asociado
    const { nuevaSuscripcion, proyecto } =
      await suscripcionService._createSubscriptionRecord(
        {
          id_usuario: transaccion.id_usuario,
          id_proyecto: transaccion.id_proyecto,
          monto: montoTransaccion,
        },
        t
      );
    // Verificar que la suscripción se haya creado.
    if (!nuevaSuscripcion || !proyecto) {
      throw new Error(
        "El servicio de suscripción falló al devolver la nueva suscripción o el proyecto asociado."
      );
    }
    // 3. Vincula el Pago y la Transacción a la nueva Suscripción
    const pagoToUpdate = await Pago.findByPk(transaccion.id_pago, {
      transaction: t,
    });
    if (pagoToUpdate) {
      await pagoToUpdate.update(
        { id_suscripcion: nuevaSuscripcion.id },
        { transaction: t }
      );
    }

    await transaccion.update(
      { id_suscripcion: nuevaSuscripcion.id },
      { transaction: t }
    );
    // 4. Descontar el primer mes pagado de la suscripción
    if (nuevaSuscripcion.meses_a_pagar > 0) {
      nuevaSuscripcion.meses_a_pagar -= 1;
      await nuevaSuscripcion.save({ transaction: t });
      console.log(
        `[SUBS] Descontado 1 mes pagado de la suscripción ${nuevaSuscripcion.id}. Meses restantes: ${nuevaSuscripcion.meses_a_pagar}`
      );
    }
    // 5. Crear Resumen de Cuenta inicial
    await resumenCuentaService.createAccountSummary(
      nuevaSuscripcion,
      proyecto,
      { transaction: t }
    );
    // 6. Actualiza el resumen de cuenta (Registra el movimiento del pago)
    await resumenCuentaService.updateAccountSummaryOnPayment(
      nuevaSuscripcion.id,
      { transaction: t }
    );
  },
  /**
   * FUNCIÓN ASISTENTE: Maneja la lógica para pagos mensuales recurrentes.
   */
  async manejarPagoMensual(transaccion, montoTransaccion, t) {
    if (!transaccion.id_pago) {
      throw new Error("Transacción de tipo 'mensual' sin ID de pago.");
    }
    // 1. Marca el Pago asociado como pagado
    await pagoService.markAsPaid(transaccion.id_pago, t);
    // 2. Obtener el ID de suscripción desde el Pago
    const pago = await Pago.findByPk(transaccion.id_pago, {
      transaction: t,
    });

    if (!pago || !pago.id_suscripcion) {
      throw new Error(
        "Pago o ID de Suscripción no encontrado para la transacción mensual."
      );
    }
    // 3. Extender la suscripción asociada (descontar 1 mes pagado)
    const suscripcion = await suscripcionService.findById(pago.id_suscripcion, {
      transaction: t,
    });

    if (!suscripcion) {
      throw new Error(`Suscripción ${pago.id_suscripcion} no encontrada.`);
    }
    // Descontar el mes pagado (si hay meses pendientes)
    if (suscripcion.meses_a_pagar > 0) {
      suscripcion.meses_a_pagar -= 1;
      await suscripcion.save({ transaction: t });
      console.log(
        `[SUBS] Pago mensual confirmado. Descontado 1 mes de la suscripción ${suscripcion.id}. Meses restantes: ${suscripcion.meses_a_pagar}`
      );
    } else {
      console.log(
        `[SUBS] Pago mensual para la suscripción ${suscripcion.id} recibido, pero no tenía meses a pagar pendientes.`
      );
    }
    // 4. Actualiza el resumen de cuenta para reflejar el pago
    await resumenCuentaService.updateAccountSummaryOnPayment(suscripcion.id, {
      transaction: t,
    });
  },
  // Función para obtener todas las transacciones
  async findAll() {
    try {
      const transacciones = await Transaccion.findAll();
      return transacciones;
    } catch (error) {
      throw new Error("Error al obtener todas las transacciones.");
    }
  },
  // Función para encontrar una transacción por su ID
  async findById(id) {
    try {
      const transaccion = await Transaccion.findByPk(id);
      return transaccion;
    } catch (error) {
      throw new Error("Error al buscar la transacción por ID.");
    }
  },
  // Función para "eliminar" lógicamente una transacción
  async softDelete(id) {
    try {
      const transaccion = await Transaccion.findByPk(id);
      if (!transaccion) return null;
      transaccion.estado = "eliminada";
      await transaccion.save();
      return transaccion;
    } catch (error) {
      throw new Error("Error al eliminar la transacción.");
    }
  },
};

module.exports = transaccionService;
