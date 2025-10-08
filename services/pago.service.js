const { Op } = require("sequelize");
const Pago = require("../models/pago");
const SuscripcionProyecto = require("../models/suscripcion_proyecto");
const Usuario = require("../models/usuario");
const Proyecto = require("../models/proyecto");
const emailService = require("./email.service");
const mensajeService = require("./mensaje.service");
const { sequelize } = require("../config/database");

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
    // 🛑 AJUSTE: Filtramos por la relación de Suscripción
    return Pago.findAll({
      include: [
        {
          model: SuscripcionProyecto,
          as: "suscripcion",
          where: {
            id_usuario: id_usuario, // Filtramos en la tabla intermedia
          },
          required: true, // Solo Pagos que tengan una suscripción de este usuario
        },
      ],
    });
  }
  /**
   * ✨ FUNCIÓN CLAVE: Valida el Pago y su propiedad a través de la Suscripción.
   * Devuelve el objeto Pago CON la suscripción incluida.
   *
   * @param {string} pagoId - El ID del pago a procesar.
   * @param {string} userId - El ID del usuario autenticado.
   * @returns {Promise<Pago>} El objeto Pago validado (incluyendo 'suscripcion').
   */,

  async getValidPaymentDetails(pagoId, userId) {
    let pago = null;

    try {
      // 1. Buscar el Pago E INCLUIR la Suscripción para validación
      pago = await Pago.findByPk(pagoId, {
        include: [
          {
            model: SuscripcionProyecto,
            as: "suscripcion",
            attributes: ["id_usuario", "id_proyecto"], // Traemos el ID de usuario y proyecto de la suscripción
            required: true,
          },
        ],
      });

      if (!pago || !pago.suscripcion) {
        throw new Error(
          `Pago ID ${pagoId} no encontrado o sin suscripción asociada.`
        );
      }

      // Si la tabla Pagos ya tiene id_usuario, usamos eso. Si es null, usamos la Suscripción.
      const propietarioId = pago.id_usuario || pago.suscripcion.id_usuario; // 🛑 AJUSTE: Validamos la propiedad a través de la Suscripción o el campo directo

      if (propietarioId !== userId) {
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

      return pago; // Devuelve el objeto Pago validado con la suscripción anidada
    } catch (error) {
      throw new Error(`Error en la validación del pago: ${error.message}`);
    }
  },

  async generarPagoMensualConDescuento(suscripcionId, options = {}) {
    const t = options.transaction || (await sequelize.transaction());
    try {
      const suscripcion = await SuscripcionProyecto.findByPk(suscripcionId, {
        transaction: t,
        include: [
          {
            model: Proyecto,
            as: "proyectoAsociado",
          },
        ],
      });

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
      const proximoMes = ultimoPago ? ultimoPago.mes + 1 : 1;

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
      const fechaVencimiento = new Date(
        now.getFullYear(),
        now.getMonth(),
        10 // Día 10
      );
      fechaVencimiento.setHours(0, 0, 0, 0); // 🛑 CORRECCIÓN: AGREGAR id_usuario y id_proyecto desde la suscripción.
      const nuevoPago = await Pago.create(
        {
          id_suscripcion: suscripcion.id,
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
  }
  /**
   * 🚨 NUEVA FUNCIÓN: Marca el pago como cancelado si es del MES 1;
   * de lo contrario, solo lo mantiene en 'pendiente'/'vencido'.
   * Se llama si la Transacción de pago asociada falla.
   */,
  async handlePaymentFailure(pagoId, t) {
    try {
      const pago = await Pago.findByPk(pagoId, { transaction: t });

      if (!pago) {
        throw new Error("Pago no encontrado para manejar la falla.");
      }

      if (pago.mes === 1 && pago.estado_pago === "pendiente") {
        // 1. Si es el mes 1 y está pendiente, lo cancelamos.
        // 🛑 Importante: El estado de la Suscripción debe ser manejado en otro lugar
        // para evitar que se cobre el siguiente mes si esta falla.
        await pago.update(
          {
            estado_pago: "cancelado",
            fecha_pago: null,
          },
          {
            transaction: t,
          }
        );
        console.log(
          `Pago ID ${pagoId} (Mes 1) cancelado debido a la falla de la transacción.`
        );
        return pago;
      } // 2. Si es Mes > 1 o si el pago ya estaba cubierto por puja, no cambiamos el estado (permanece pendiente/vencido).

      console.log(
        `Pago ID ${pagoId} (Mes ${pago.mes}) mantiene su estado pendiente/vencido tras la falla de la transacción.`
      );
      return pago;
    } catch (error) {
      throw error;
    }
  },

  async markAsPaid(pagoId, t) {
    // ... (Lógica de confirmación)
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
        ],
      });

      if (!pago) {
        throw new Error("Pago no encontrado.");
      }
      if (pago.estado_pago === "pagado") {
        return pago;
      } // Se usa la relación de suscripción para obtener usuario y proyecto

      const usuario = pago.suscripcion?.usuario;
      const proyecto = pago.suscripcion?.proyectoAsociado;

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
      throw error;
    }
  }, // 🗑️ NUEVA FUNCIÓN: Elimina los pagos que están en estado 'cancelado'.

  async deleteCanceledPayments() {
    try {
      const result = await Pago.destroy({
        where: {
          estado_pago: "cancelado",
        },
      });
      return result; // Retorna el número de filas eliminadas
    } catch (error) {
      throw new Error(`Error al eliminar pagos cancelados: ${error.message}`);
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
