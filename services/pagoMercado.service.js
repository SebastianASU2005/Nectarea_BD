const {
  MercadoPagoConfig,
  Preference,
  Payment,
  MerchantOrder,
} = require("mercadopago");
const { sequelize } = require("../config/database");
const { Transaction } = require("sequelize");
require("dotenv").config();

// Dependencias de modelos/servicios (asegúrate de que las rutas sean correctas)
const Transaccion = require("../models/transaccion");
const PagoMercado = require("../models/pagoMercado");
const transaccionService = require("../services/transaccion.service"); // Asegurar que está bien requerido

const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
const HOST_URL = (process.env.HOST_URL || "http://localhost:3000").trim();
const CURRENCY_ID = process.env.MP_CURRENCY_ID || "ARS";

// Mapeo de estados MP a estados internos
const MP_STATUS_MAP = {
  approved: "pagado",
  pending: "en_proceso",
  in_process: "en_proceso",
  rejected: "rechazado",
  cancelled: "rechazado",
  refunded: "devuelto",
  charged_back: "devuelto",
};

let client = null;
let preferenceService = null;
let paymentServiceMp = null;
let merchantOrderService = null;

// --- INICIALIZACIÓN DEL CLIENTE MP ---
if (
  MP_ACCESS_TOKEN &&
  MP_ACCESS_TOKEN !== "[Pega_aqui_tu_TEST-Access_Token_de_MP]"
) {
  try {
    client = new MercadoPagoConfig({
      accessToken: MP_ACCESS_TOKEN,
      options: { timeout: 5000 },
    });
    preferenceService = new Preference(client);
    paymentServiceMp = new Payment(client);
    merchantOrderService = new MerchantOrder(client);
    console.log("✅ Mercado Pago SDK configurado.");
  } catch (error) {
    console.error("❌ Error al inicializar Mercado Pago:", error.message);
  }
} else {
  console.error(
    "⚠️ MP_ACCESS_TOKEN no configurado o es el valor por defecto. El servicio de MP no funcionará."
  );
}
// ------------------------------------

const paymentService = {
  /**
   * ✨ Crea la sesión de pago (Preferencia de MP)
   */
  async createPaymentSession(datos, transaccionId) {
    if (!preferenceService) {
      throw new Error(
        "El servicio de Mercado Pago (Preference) no está inicializado. Revise MP_ACCESS_TOKEN."
      );
    }

    const { titulo, monto, id_usuario } = datos;
    // ... (Lógica de creación de preferencia)

    try {
      const webhookUrl = `${HOST_URL}/api/payment/webhook/mercadopago`;

      const preferenceBody = {
        items: [
          {
            title: titulo,
            unit_price: parseFloat(monto),
            quantity: 1,
            currency_id: CURRENCY_ID,
          },
        ],
        external_reference: String(transaccionId),
        back_urls: {
          success: `${HOST_URL}/pago/exito/${transaccionId}`,
          failure: `${HOST_URL}/pago/fallo/${transaccionId}`,
          pending: `${HOST_URL}/pago/pendiente/${transaccionId}`,
        },
        notification_url: webhookUrl,
        auto_return: "approved",
        statement_descriptor: "PLATAFORMA_INV",
        payer: {
          id: String(id_usuario),
        },
      };

      const response = await preferenceService.create({ body: preferenceBody });
      return {
        preferenceId: response.id,
        redirectUrl: response.init_point,
      };
    } catch (error) {
      console.error("❌ Error al crear preferencia en MP:", error.message);
      throw new Error(`Fallo al crear preferencia de pago: ${error.message}`);
    }
  }
  /**
   * Verifica y obtiene los detalles del pago desde Mercado Pago
   */,

  async verifyAndFetchPayment(req, metodo) {
    if (metodo !== "mercadopago" || !paymentServiceMp) return null;

    // ... (Lógica para extraer paymentId y topic)
    const topicType =
      req.query.topic || req.query.type || req.body?.type || req.body?.topic;

    let paymentId =
      req.query.id ||
      req.query["data.id"] ||
      req.body?.data?.id ||
      req.body?.resource;

    if (typeof paymentId === "string" && paymentId.startsWith("http")) {
      paymentId = paymentId.split("/").pop();
    }

    if (topicType !== "payment" || !paymentId) {
      return null;
    }

    try {
      const paymentData = await paymentServiceMp.get({ id: paymentId });
      const transaccionId = paymentData.external_reference;
      if (!transaccionId) {
        return null;
      }
      return {
        transaccionId: parseInt(transaccionId),
        status: paymentData.status,
        transactionId: paymentData.id,
        paymentDetails: {
          transaction_amount: paymentData.transaction_amount,
          payment_method_type: paymentData.payment_type_id,
          date_approved: paymentData.date_approved,
        },
        rawDetails: paymentData,
      };
    } catch (error) {
      console.error(`❌ Error al fetchear pago ${paymentId}:`, error.message);
      return null;
    }
  }
  /**
   * 🌟 Procesar Merchant Orders para capturar pagos fallidos/finales
   */,

  async procesarPagosDeMerchantOrder(merchantOrderId) {
    if (!merchantOrderService) {
      throw new Error(
        "El servicio de MerchantOrder no está inicializado. Revise MP_ACCESS_TOKEN."
      );
    }

    const t = await sequelize.transaction({
      isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED,
    });

    try {
      // 💡 CORRECCIÓN CRÍTICA: Asegurar que el ID sea un STRING
      const merchantOrderData = await merchantOrderService.get({
        id: String(merchantOrderId),
      });

      const transaccionId = parseInt(merchantOrderData.external_reference);

      if (!transaccionId) {
        throw new Error(
          "Merchant Order sin referencia de Transacción externa."
        );
      }

      for (const mpPayment of merchantOrderData.payments) {
        const internalStatus = MP_STATUS_MAP[mpPayment.status];
        if (
          internalStatus === "pagado" ||
          internalStatus === "rechazado" ||
          internalStatus === "devuelto"
        ) {
          let transaccion = await Transaccion.findByPk(transaccionId, {
            transaction: t,
            lock: t.LOCK.UPDATE,
          });

          if (
            !transaccion ||
            transaccion.estado_transaccion === "pagado" ||
            transaccion.estado_transaccion === "fallido"
          ) {
            continue;
          }

          let pagoMercado = await PagoMercado.findOne({
            where: { id_transaccion_pasarela: mpPayment.id },
            transaction: t,
          }); // Lógica para registrar/actualizar PagoMercado

          if (!pagoMercado) {
            pagoMercado = await PagoMercado.create(
              {
                id_transaccion: transaccionId,
                id_transaccion_pasarela: mpPayment.id,
                monto_pagado: mpPayment.transaction_amount,
                metodo_pasarela: "mercadopago",
                estado: internalStatus,
                tipo_medio_pago: mpPayment.payment_type_id,
                fecha_aprobacion: mpPayment.date_approved,
                detalles_raw: mpPayment,
              },
              { transaction: t }
            );

            if (!transaccion.id_pago_pasarela) {
              await transaccion.update(
                { id_pago_pasarela: pagoMercado.id },
                { transaction: t }
              );
            }
          } else {
            await pagoMercado.update(
              { estado: internalStatus },
              { transaction: t }
            );
          } // Lógica de negocio (confirmar, fallar, revertir)

          if (internalStatus === "pagado") {
            await transaccionService.confirmarTransaccion(transaccionId, {
              transaction: t,
            });
          } else if (internalStatus === "rechazado") {
            // Asegurarse de que esta función exista en transaccion.service
            await transaccionService.procesarFalloTransaccion(
              transaccionId,
              "fallido",
              "Rechazado por MO",
              {
                transaction: t,
              }
            );
          } else if (internalStatus === "devuelto") {
            // Asegurarse de que esta función exista y maneje la reversión
            await transaccionService.procesarFalloTransaccion(
              transaccionId,
              "reembolsado",
              "Devuelto por MO",
              {
                transaction: t,
              }
            );
          }
        }
      }

      await t.commit();
    } catch (error) {
      await t.rollback();
      console.error(
        `❌ Error CRÍTICO al procesar Merchant Order ${merchantOrderId}:`,
        error.message
      );
      throw error;
    }
  }
  /**
   * Refresca el estado de un pago desde Mercado Pago
   */,

  async refreshPaymentStatus(transaccionId, mpTransactionId) {
    // ... (El resto de la función refreshPaymentStatus es correcta)
    if (!paymentServiceMp) return null;

    try {
      const paymentData = await paymentServiceMp.get({ id: mpTransactionId });
      const transaccion = await Transaccion.findByPk(transaccionId);
      let pagoMercado = await PagoMercado.findOne({
        where: { id_transaccion: transaccionId },
      });

      const internalStatus = MP_STATUS_MAP[paymentData.status] || "en_proceso"; // Actualizar PagoMercado

      const pagoData = {
        estado: internalStatus,
        tipo_medio_pago: paymentData.payment_type_id,
        fecha_aprobacion: paymentData.date_approved,
        detalles_raw: paymentData,
      };

      if (pagoMercado) {
        await pagoMercado.update(pagoData);
      } // Actualizar Transaccion si el estado final es alcanzado

      if (
        internalStatus === "pagado" &&
        transaccion.estado_transaccion !== "pagado"
      ) {
        await transaccionService.confirmarTransaccion(transaccionId);
        await transaccion.reload();
      }

      return {
        transaccion,
        pagoMercado: pagoMercado ? await pagoMercado.reload() : null,
      };
    } catch (error) {
      console.error(
        `❌ Error al refrescar estado de pago ${mpTransactionId}:`,
        error.message
      );
      return null;
    }
  },
};

module.exports = paymentService;
