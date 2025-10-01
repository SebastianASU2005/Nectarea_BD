const { Op } = require("sequelize");
const Pago = require("../models/pago");
const SuscripcionProyecto = require("../models/suscripcion_proyecto");
const Usuario = require("../models/usuario");
const Proyecto = require("../models/proyecto");
const emailService = require("./email.service");
const mensajeService = require("./mensaje.service");
const SuscripcionProyectoService = require("./suscripcion_proyecto.service");
const resumenCuentaService = require("./resumen_cuenta.service");
const { sequelize } = require("../config/database");

// NOTA: La importación de transaccionService se hace localmente.

const pagoService = {
  async create(data, options = {}) {
    return Pago.create(data, options);
  },

  async findAll() {
    return Pago.findAll();
  },

  async findById(id, options = {}) {
    return Pago.findByPk(id, options);
  },

  async findByUserId(id_usuario) {
    return Pago.findAll({
      include: [
        {
          model: SuscripcionProyecto,
          as: "suscripcion",
          where: {
            id_usuario: id_usuario,
          },
          attributes: [],
          required: false,
        },
      ],
      where: {
        [Op.or]: [
          {
            "$suscripcion.id_usuario$": id_usuario,
          },
          {
            id_usuario: id_usuario,
            id_suscripcion: null,
          },
        ],
      },
    });
  },
  /**
   * Procesa la solicitud de pago de un Pago pendiente o vencido.
   * Crea el registro de Transacción en estado 'pendiente' y devuelve su ID.
   * La CONFIRMACIÓN debe realizarse por separado a través de transaccionService.confirmarTransaccion.
   *
   * @param {string} pagoId - El ID del pago a procesar.
   * @param {string} userId - El ID del usuario autenticado.
   * @returns {Promise<object>} Objeto con un mensaje y la Transaccion creada (pendiente).
   */
  async processPaymentCreation(pagoId, userId) {
    // Importación local para romper la dependencia circular.
    const transaccionService = require("./transaccion.service");

    let pago = null;

    try {
      // 1. Buscar y Validar el Pago
      pago = await Pago.findByPk(pagoId);

      if (!pago) {
        throw new Error(`Pago ID ${pagoId} no encontrado.`);
      }

      if (pago.id_usuario !== userId) {
        throw new Error(
          "Acceso denegado. No eres el propietario de este pago."
        );
      }

      const estadoActual = pago.estado_pago;

      if (
        estadoActual === "pagado" ||
        estadoActual === "cancelado" ||
        estadoActual === "cubierto_por_puja"
      ) {
        throw new Error(
          `El pago ID ${pagoId} ya se encuentra en estado: ${estadoActual}.`
        );
      }

      if (estadoActual !== "pendiente" && estadoActual !== "vencido") {
        throw new Error(
          `Estado de pago inválido (${estadoActual}). Solo se pueden pagar estados PENDIENTE o VENCIDO.`
        );
      }

      // 2. Crear datos de la Transacción
      const transaccionData = {
        id_usuario: userId,
        monto: pago.monto,
        // CLAVE: El tipo de transacción es 'mensual'
        tipo_transaccion: "mensual",
        id_pago: pagoId,
        // CLAVE: El estado inicial es 'pendiente'
        estado_transaccion: "pendiente",
      };

      // 3. Crear el registro de Transacción (sin transacción de Sequelize en este nivel)
      const nuevaTransaccion = await transaccionService.create(transaccionData);

      // 4. DEVOLVER: No se llama a confirmarTransaccion.
      // La transacción queda pendiente, lista para ser confirmada por el webhook o la ruta /confirmar.
      return {
        message: "Transacción de pago creada y pendiente de confirmación.",
        transaccion: nuevaTransaccion,
      };
    } catch (error) {
      // Solo propagamos el error de validación/creación
      throw new Error(`Error en el proceso de pago: ${error.message}`);
    }
  },

  async generarPagoMensualConDescuento(suscripcionId, options = {}) {
    const t = options.transaction || (await sequelize.transaction());
    try {
      const suscripcion = await SuscripcionProyecto.findByPk(suscripcionId, {
        transaction: t,
        include: [
          {
            model: Proyecto, // CORRECCIÓN CLAVE: Usamos el alias correcto definido en configureAssociations.
            as: "proyectoAsociado",
          },
        ],
      }); // CAMBIO NECESARIO: Ya que el alias fue corregido arriba, accedemos al proyecto usando el alias corregido.

      if (!suscripcion || !suscripcion.proyectoAsociado) {
        if (!options.transaction) await t.rollback();
        throw new Error("Suscripción o proyecto no encontrado.");
      }

      if (suscripcion.meses_a_pagar <= 0) {
        if (!options.transaction) await t.commit();
        return {
          message: "No hay más meses por pagar en esta suscripción.",
        };
      }

      const ultimoPago = await Pago.findOne({
        where: {
          id_suscripcion: suscripcionId,
        },
        order: [["mes", "DESC"]],
        transaction: t,
      });
      const proximoMes = ultimoPago ? ultimoPago.mes + 1 : 1; // CAMBIO NECESARIO: Accedemos al proyecto usando el alias corregido.

      const cuotaMensual = parseFloat(
        suscripcion.proyectoAsociado.monto_inversion
      );
      let saldoAFavor = parseFloat(suscripcion.saldo_a_favor);
      let montoAPagar = cuotaMensual;
      let estado_pago = "pendiente";

      if (saldoAFavor > 0) {
        montoAPagar = Math.max(0, cuotaMensual - saldoAFavor);
        saldoAFavor = Math.max(0, saldoAFavor - cuotaMensual);
        await suscripcion.update(
          {
            saldo_a_favor: saldoAFavor.toFixed(2),
          },
          {
            transaction: t,
          }
        );
      }
      if (montoAPagar === 0) {
        estado_pago = "cubierto_por_puja";
      }

      const now = new Date();
      // >>> MODIFICACIÓN PARA CUMPLIR CON LA REGLA: Vencimiento siempre el día 10 del mes actual.
      const fechaVencimiento = new Date(
        now.getFullYear(),
        now.getMonth(), // Mes actual (sin +1)
        10 // Día 10
      );
      // Aseguramos que la hora sea 00:00:00 para evitar problemas de zona horaria o comparación.
      fechaVencimiento.setHours(0, 0, 0, 0);
      // <<< FIN DE MODIFICACIÓN

      const nuevoPago = await Pago.create(
        {
          id_suscripcion: suscripcion.id,
          // 🚨 FIX CLAVE: Asegurar que el ID de usuario y proyecto se incluyan en el pago.
          id_usuario: suscripcion.id_usuario,
          id_proyecto: suscripcion.id_proyecto,
          monto: montoAPagar.toFixed(2),
          fecha_vencimiento: fechaVencimiento,
          estado_pago: estado_pago,
          mes: proximoMes,
        },
        {
          transaction: t,
        }
      );

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

  async markAsPaid(pagoId, t) {
    try {
      const pago = await Pago.findByPk(pagoId, {
        transaction: t,
        include: [
          {
            model: SuscripcionProyecto,
            as: "suscripcion",
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
          },
          { model: Usuario, as: "usuarioDirecto" },
          { model: Proyecto, as: "proyectoDirecto" },
        ],
      });

      if (!pago) {
        throw new Error("Pago no encontrado.");
      }
      if (pago.estado_pago === "pagado") {
        return pago;
      }

      const usuario = pago.suscripcion?.usuario || pago.usuarioDirecto;
      const proyecto =
        pago.suscripcion?.proyectoAsociado || pago.proyectoDirecto;

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
        {
          transaction: t,
        }
      );

      const subject = `Confirmación de Pago Recibido: ${proyecto.nombre_proyecto}`;
      const text = `Hola ${usuario.nombre},\n\nHemos recibido tu pago de $${pago.monto} para la cuota de la suscripción al proyecto "${proyecto.nombre_proyecto}".\n\n¡Gracias por tu apoyo!`;

      await emailService.sendEmail(usuario.email, subject, text);

      const remitente_id = 1;
      const contenido = `Tu pago de $${pago.monto} para la cuota del proyecto "${proyecto.nombre_proyecto}" ha sido procesado exitosamente.`;
      await mensajeService.crear(
        {
          id_remitente: remitente_id,
          id_receptor: usuario.id,
          contenido: contenido,
        },
        {
          transaction: t,
        }
      );

      return pago;
    } catch (error) {
      // No hacemos rollback aquí. La transacción (t) es manejada por el servicio padre.
      throw error;
    }
  },

  async findPaymentsDueSoon() {
    const today = new Date();
    const threeDaysFromNow = new Date();
    threeDaysFromNow.setDate(today.getDate() + 3);

    return Pago.findAll({
      where: {
        estado_pago: "pendiente",
        fecha_vencimiento: {
          [Op.between]: [today, threeDaysFromNow],
        },
      },
      include: [
        {
          model: SuscripcionProyecto,
          as: "suscripcion",
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
        },
      ],
    });
  },

  async findOverduePayments() {
    const today = new Date();
    return Pago.findAll({
      where: {
        estado_pago: "pendiente",
        fecha_vencimiento: {
          [Op.lt]: today,
        },
      },
      include: [
        {
          model: SuscripcionProyecto,
          as: "suscripcion",
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
        },
      ],
    });
  },

  async updateLastNotificationDate(id_pago) {
    try {
      await Pago.update(
        {
          fecha_ultima_notificacion: new Date(),
        },
        {
          where: {
            id_pago: id_pago,
          },
        }
      );
    } catch (error) {
      throw error;
    }
  },
};

module.exports = pagoService;
