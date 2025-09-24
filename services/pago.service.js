const { Op } = require("sequelize");
const Pago = require("../models/pago");
const SuscripcionProyecto = require("../models/suscripcion_proyecto");
const Usuario = require("../models/usuario");
const Proyecto = require("../models/proyecto");
const emailService = require("./email.service");
const mensajeService = require("./mensaje.service");
const TransaccionService = require("./transaccion.service");
const { sequelize } = require("../config/database");

const pagoService = {
  async create(data) {
    return Pago.create(data);
  },

  async findAll() {
    return Pago.findAll();
  },

  async findById(id) {
    return Pago.findByPk(id);
  },

  async findByUserId(id_usuario) {
    const suscripciones = await SuscripcionProyecto.findAll({
      where: { id_usuario: id_usuario },
      attributes: ["id"],
    });

    if (suscripciones.length === 0) {
      return [];
    }

    const suscripcionIds = suscripciones.map((susc) => susc.id);
    return Pago.findAll({
      where: { id_suscripcion: suscripcionIds },
    });
  }, // **VERSIÓN CORREGIDA Y ROBUSTA**: Genera un nuevo pago mensual considerando el saldo a favor

  async generarPagoMensualConDescuento(suscripcionId, options = {}) {
    const t = options.transaction || (await sequelize.transaction());
    try {
      const suscripcion = await SuscripcionProyecto.findByPk(suscripcionId, {
        transaction: t,
        include: [
          {
            model: Proyecto,
            as: "proyecto",
          },
        ],
      });

      if (!suscripcion || !suscripcion.proyecto) {
        await t.rollback();
        throw new Error("Suscripción o proyecto no encontrado.");
      } // Verifica el contador de meses a pagar como una condición de parada

      if (suscripcion.meses_a_pagar <= 0) {
        await t.commit();
        return { message: "No hay más meses por pagar en esta suscripción." };
      } // Calcula el próximo mes basándose en el último pago existente

      const ultimoPago = await Pago.findOne({
        where: { id_suscripcion: suscripcionId },
        order: [["mes", "DESC"]],
        transaction: t,
      });
      const proximoMes = ultimoPago ? ultimoPago.mes + 1 : 1;

      const cuotaMensual = parseFloat(suscripcion.proyecto.monto_inversion);
      let saldoAFavor = parseFloat(suscripcion.saldo_a_favor);
      let montoAPagar = cuotaMensual;
      let estadoPago = "pendiente";

      if (saldoAFavor > 0) {
        montoAPagar = Math.max(0, cuotaMensual - saldoAFavor);
        saldoAFavor = Math.max(0, saldoAFavor - cuotaMensual); // <-- Corrección
        await suscripcion.update(
          { saldo_a_favor: saldoAFavor.toFixed(2) },
          { transaction: t }
        );
      }
      if (montoAPagar === 0) {
        estadoPago = "cubierto_por_puja";
      }

      const nuevoPago = await Pago.create(
        {
          id_suscripcion: suscripcion.id,
          monto: montoAPagar.toFixed(2),
          monto_base: cuotaMensual.toFixed(2),
          fecha_vencimiento: new Date(),
          estado_pago: estadoPago,
          mes: proximoMes,
        },
        { transaction: t }
      );

      await suscripcion.decrement("meses_a_pagar", { by: 1, transaction: t });

      await t.commit();
      return nuevoPago;
    } catch (error) {
      if (t) await t.rollback();
      throw error;
    }
  },

  async markAsPaid(pagoId) {
    const t = await sequelize.transaction();
    try {
      const pago = await Pago.findByPk(pagoId, {
        transaction: t,
        include: [
          {
            model: SuscripcionProyecto,
            as: "suscripcion",
            include: [
              { model: Proyecto, as: "proyecto" },
              { model: Usuario, as: "usuario" },
            ],
          },
        ],
      });

      if (!pago) {
        throw new Error("Pago no encontrado.");
      }

      await pago.update(
        { estado_pago: "pagado", fecha_pago: new Date() },
        { transaction: t }
      );

      await TransaccionService.create(
        {
          tipo_transaccion: "Pago de Cuota",
          monto: pago.monto,
          id_usuario: pago.suscripcion.usuario.id,
          id_proyecto: pago.suscripcion.proyecto.id,
          id_pago: pago.id,
        },
        { transaction: t }
      );

      const usuario = pago.suscripcion.usuario;
      const proyecto = pago.suscripcion.proyecto;

      const subject = `Confirmación de Pago Recibido: ${proyecto.nombre_proyecto}`;
      const text = `Hola ${usuario.nombre},\n\nHemos recibido tu pago de $${pago.monto} para la suscripción al proyecto "${proyecto.nombre_proyecto}".\n\n¡Gracias por tu apoyo!`;

      await emailService.sendEmail(usuario.email, subject, text);

      const remitente_id = 1;
      const contenido = `Tu pago de $${pago.monto} para la suscripción al proyecto "${proyecto.nombre_proyecto}" ha sido procesado exitosamente. ¡Gracias!`;
      await mensajeService.crear(
        {
          id_remitente: remitente_id,
          id_receptor: usuario.id,
          contenido: contenido,
        },
        { transaction: t }
      );

      await t.commit();
      return pago;
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },

  async update(id, data) {
    const pago = await this.findById(id);
    if (!pago) {
      return null;
    }
    return pago.update(data);
  },

  async softDelete(id) {
    const pago = await this.findById(id);
    if (!pago) {
      return null;
    }
    return pago.update({ activo: false });
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
              as: "proyecto",
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
              as: "proyecto",
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
};

module.exports = pagoService;
