// Archivo: services/mercadopago.service.js
// VERSIÓN MEJORADA – Descripción detallada + metadatos enriquecidos + firma verificable

const {
  MercadoPagoConfig,
  Preference,
  Payment,
  MerchantOrder,
} = require("mercadopago");
const { sequelize } = require("../config/database");
const { Transaction } = require("sequelize");
const axios = require("axios");
require("dotenv").config();

const Transaccion = require("../models/transaccion");
const PagoMercado = require("../models/pagoMercado");

const MP_LIVE_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
const MP_TEST_ACCESS_TOKEN = process.env.MP_TEST_ACCESS_TOKEN;
const HOST_URL = (process.env.HOST_URL || "http://localhost:3000").trim();
const FRONTEND_URL = (
  process.env.FRONTEND_URL || "http://localhost:5173"
).trim();
const CURRENCY_ID = process.env.MP_CURRENCY_ID || "ARS";

const MP_STATUS_MAP = {
  approved: "pagado",
  pending: "en_proceso",
  in_process: "pendiente",
  rejected: "rechazado",
  cancelled: "rechazado",
  refunded: "devuelto",
  charged_back: "devuelto",
};

let client = null;
let preferenceService = null;
let paymentAPI = null;
let merchantOrderService = null;

if (
  MP_LIVE_ACCESS_TOKEN &&
  MP_LIVE_ACCESS_TOKEN !== "[Pega_aqui_tu_TEST-Access_Token_de_MP]"
) {
  try {
    client = new MercadoPagoConfig({
      accessToken: MP_LIVE_ACCESS_TOKEN,
      options: { timeout: 5000 },
    });
    preferenceService = new Preference(client);
    paymentAPI = new Payment(client);
    merchantOrderService = new MerchantOrder(client);
    console.log("✅ [MP Service] Mercado Pago SDK configurado.");
    console.log(
      "⚠️ [MP Service] Reembolsos se manejan vía API REST con Axios (fallback).",
    );
  } catch (error) {
    console.error(
      "❌ [MP Service] Error al inicializar Mercado Pago:",
      error.message,
    );
  }
} else {
  console.error(
    "⚠️ [MP Service] MP_ACCESS_TOKEN no configurado o es el valor por defecto. El servicio de MP no funcionará.",
  );
}

const paymentService = {
  async createPaymentSession(datos, transaccionId) {
    if (!preferenceService) {
      throw new Error(
        "El servicio de Mercado Pago (Preference) no está inicializado.",
      );
    }

    const {
      titulo,
      monto,
      id_usuario,
      nombre_usuario,
      apellido_usuario,
      email_usuario,
      telefono,
      documento,
      tipo_transaccion,
      id_proyecto,
    } = datos;

    try {
      console.log(
        `🔍 Creando preferencia para Transacción ID: ${transaccionId}`,
      );
      if (!monto || isNaN(monto) || monto <= 0) {
        throw new Error(`Monto inválido recibido: ${monto}`);
      }

      const webhookUrl = `${HOST_URL}/api/payment/webhook/mercadopago`;
      const descripcionDetallada = this._generarDescripcionDetallada(
        datos,
        transaccionId,
      );

      const preferenceBody = {
        items: [
          {
            title: titulo,
            unit_price: monto,
            quantity: 1,
            currency_id: CURRENCY_ID,
            description: descripcionDetallada,
            picture_url: `https://res.cloudinary.com/dj7kcgf2z/image/upload/v1762267998/LoteplanLogo_dxbyo5.jpg`,
          },
        ],
        external_reference: String(transaccionId),
        back_urls: {
          success: `${process.env.FRONTEND_URL}/pago/exito/${transaccionId}`,
          failure: `${process.env.FRONTEND_URL}/pago/fallo/${transaccionId}`,
          pending: `${process.env.FRONTEND_URL}/pago/pendiente/${transaccionId}`,
        },
        notification_url: webhookUrl,
        auto_return: "approved",
        statement_descriptor: `LOTEPLAN-${String(transaccionId).slice(-6)}`,
        purpose: "wallet_purchase",
        additional_info: {
          items: [
            {
              id: String(transaccionId),
              title: titulo,
              description: descripcionDetallada,
              picture_url: `https://res.cloudinary.com/dj7kcgf2z/image/upload/v1762267998/LoteplanLogo_dxbyo5.jpg`,
              category_id: "services",
              quantity: 1,
              unit_price: monto,
            },
          ],
          payer: {
            first_name: nombre_usuario || undefined,
            last_name: apellido_usuario || undefined,
            phone: telefono
              ? {
                  area_code: telefono.substring(0, 4) || undefined,
                  number: telefono.substring(4) || undefined,
                }
              : undefined,
          },
          seller: {
            name: "Loteplan",
            phone: "261-1234567",
          },
        },
        metadata: {
          transaccion_id: transaccionId,
          tipo_transaccion: tipo_transaccion || "pago",
          plataforma: "Loteplan",
          fecha_creacion: new Date().toISOString(),
          proyecto_id: id_proyecto || undefined,
          usuario_id: id_usuario,
          usuario_email: email_usuario,
          usuario_documento: documento,
        },
        payment_methods: {
          installments: 12,
        },
        payer: {
          id: String(id_usuario),
          name: nombre_usuario || undefined,
          surname: apellido_usuario || undefined,
          email: email_usuario || undefined,
          phone: telefono
            ? {
                area_code: telefono.substring(0, 4) || undefined,
                number: telefono.substring(4) || undefined,
              }
            : undefined,
          identification: documento
            ? {
                type: "DNI",
                number: String(documento),
              }
            : undefined,
        },
      };

      const idempotencyKey = `${transaccionId}-${Date.now()}`;
      const response = await preferenceService.create({
        body: preferenceBody,
        requestOptions: { idempotencyKey },
      });

      console.log(
        `✅ Preferencia creada. ID: ${response.id}, URL: ${response.init_point}`,
      );
      return {
        preferenceId: response.id,
        redirectUrl: response.init_point,
      };
    } catch (error) {
      console.error("❌ Error al crear preferencia en MP:", error.message);
      throw new Error(`Fallo al crear preferencia de pago: ${error.message}`);
    }
  },

  async verifyAndFetchPayment(req, metodo) {
    if (metodo !== "mercadopago" || !paymentAPI) return null;

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
      console.warn(
        `⚠️ Webhook ignorado. Topic: ${topicType}, ID: ${paymentId}`,
      );
      return null;
    }

    try {
      const paymentData = await paymentAPI.get({ id: paymentId });
      const transaccionId = paymentData.external_reference;
      if (!transaccionId) {
        console.warn(`⚠️ Pago ID ${paymentId} sin external_reference.`);
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
  },

  async realizarReembolso(paymentId, monto = null) {
    console.log(
      `➡️ Solicitando reembolso para Payment ID: ${paymentId}. Monto: ${monto ?? "Total"}`,
    );
    const idempotencyKey = `${paymentId}-${Date.now()}`;
    const tokens = [
      { name: "LIVE", value: MP_LIVE_ACCESS_TOKEN },
      { name: "TEST", value: MP_TEST_ACCESS_TOKEN },
    ];
    let lastError = null;
    for (const { name: tokenName, value: accessToken } of tokens) {
      if (!accessToken) continue;
      try {
        console.log(`   - Intentando reembolso con Token: ${tokenName}`);
        const url = `https://api.mercadopago.com/v1/payments/${paymentId}/refunds`;
        const headers = {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "X-Idempotency-Key": idempotencyKey,
        };
        const body =
          monto !== null && monto !== undefined
            ? { amount: parseFloat(monto) }
            : {};
        const response = await axios.post(url, body, { headers });
        console.log(
          `✅ Reembolso exitoso con token ${tokenName}. Refund ID: ${response.data.id}`,
        );
        return {
          success: true,
          refundId: response.data.id,
          status: response.data.status,
          amount: response.data.amount,
        };
      } catch (error) {
        const errorData = error.response?.data || {};
        const errorMsg = errorData.message || error.message;
        const errorStatus = error.response?.status;
        if (
          errorMsg.toLowerCase().includes("already refunded") ||
          errorStatus === 423 ||
          (errorStatus === 400 && errorMsg.toLowerCase().includes("refund"))
        ) {
          console.warn(
            `⚠️ El pago ${paymentId} ya fue reembolsado (Status ${errorStatus}).`,
          );
          return {
            success: false,
            alreadyRefunded: true,
            message: "El pago ya fue reembolsado o está en proceso.",
          };
        }
        if (
          errorStatus === 409 &&
          errorMsg.includes("Movement operations pending")
        ) {
          console.warn(
            `⏰ Pago ${paymentId} en proceso, reintentando más tarde.`,
          );
          return { success: false, pending: true, message: errorMsg };
        }
        if (errorStatus === 401 || errorStatus === 403) {
          console.warn(
            `   - Fallo con token ${tokenName} (Status ${errorStatus}). Reintentando con otro token.`,
          );
          continue;
        }
        console.error(
          `❌ Fallo crítico con token ${tokenName}:`,
          errorData || error.message,
        );
        lastError = errorData;
        break;
      }
    }
    throw new Error(
      `No se pudo reembolsar. Último error: ${lastError?.message || "Desconocido"}`,
    );
  },

  async procesarPagosDeMerchantOrder(merchantOrderId) {
    const transaccionService = require("../services/transaccion.service");
    if (!merchantOrderService)
      throw new Error("Servicio de MerchantOrder no inicializado.");
    console.log(`➡️ Procesando Merchant Order ID: ${merchantOrderId}`);
    const t = await sequelize.transaction({
      isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED,
    });
    try {
      const merchantOrderData = await merchantOrderService.get({
        id: String(merchantOrderId),
      });
      const transaccionId = parseInt(merchantOrderData.external_reference);
      if (!transaccionId)
        throw new Error("Merchant Order sin referencia de Transacción.");
      for (const mpPayment of merchantOrderData.payments) {
        const internalStatus = MP_STATUS_MAP[mpPayment.status];
        if (["pagado", "rechazado", "devuelto"].includes(internalStatus)) {
          let transaccion = await Transaccion.findByPk(transaccionId, {
            transaction: t,
            lock: t.LOCK.UPDATE,
          });
          if (!transaccion) continue;
          if (
            ["pagado", "fallido", "reembolsado"].includes(
              transaccion.estado_transaccion,
            )
          )
            continue;
          let pagoMercado = await PagoMercado.findOne({
            where: { id_transaccion_pasarela: mpPayment.id },
            transaction: t,
          });
          if (internalStatus === "pagado") {
            await transaccionService.confirmarTransaccion(transaccionId, {
              transaction: t,
            });
          } else if (internalStatus === "rechazado") {
            await transaccionService.procesarFalloTransaccion(
              transaccionId,
              "fallido",
              "Rechazado por MO",
              { transaction: t },
            );
          } else if (internalStatus === "devuelto") {
            await transaccionService.procesarFalloTransaccion(
              transaccionId,
              "reembolsado",
              "Devuelto por MO",
              { transaction: t },
            );
          }
        }
      }
      await t.commit();
      console.log(`✅ Merchant Order ${merchantOrderId} procesada.`);
    } catch (error) {
      await t.rollback();
      console.error(
        `❌ Error al procesar Merchant Order ${merchantOrderId}:`,
        error.message,
      );
      throw error;
    }
  },

  _generarDescripcionDetallada(datos, transaccionId) {
    const fecha = new Date().toLocaleDateString("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
    const hora = new Date().toLocaleTimeString("es-AR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

    let descripcion = `${datos.titulo || "Transacción"}\n`;
    descripcion += `ID Loteplan: #${transaccionId}\n`;
    descripcion += `Fecha: ${fecha} - ${hora}\n`;
    if (datos.id_proyecto) descripcion += `Proyecto ID: ${datos.id_proyecto}\n`;
    if (datos.nombre_usuario) {
      descripcion +=
        `Usuario: ${datos.nombre_usuario} ${datos.apellido_usuario || ""}\n`.trim();
    }
    if (datos.tipo_transaccion) {
      const tipoLegible = {
        directo: "Inversión Directa",
        Puja: "Pago de Puja Ganadora",
        mensual: "Cuota de Suscripción",
        adhesion: "Cuota de Adhesión",
      };
      descripcion += `Tipo: ${tipoLegible[datos.tipo_transaccion] || datos.tipo_transaccion}\n`;
    }
    descripcion += `Monto: $${datos.monto} ${CURRENCY_ID}`;
    return descripcion;
  },

  async refreshPaymentStatus(transaccionId, mpTransactionId) {
    const transaccionService = require("../services/transaccion.service");
    if (!paymentAPI) return null;
    console.log(
      `➡️ Refrescando estado para Transacción ID: ${transaccionId}, Pago MP ID: ${mpTransactionId}`,
    );
    try {
      const paymentData = await paymentAPI.get({ id: mpTransactionId });
      const transaccion = await Transaccion.findByPk(transaccionId);
      if (!transaccion) return null;
      let pagoMercado = await PagoMercado.findOne({
        where: { id_transaccion: transaccionId },
      });
      const internalStatus = MP_STATUS_MAP[paymentData.status] || "en_proceso";
      const pagoData = {
        estado: internalStatus,
        tipo_medio_pago: paymentData.payment_type_id,
        fecha_aprobacion: paymentData.date_approved,
        detalles_raw: paymentData,
      };
      if (pagoMercado) {
        await pagoMercado.update(pagoData);
      } else {
        console.warn(
          `   - No se encontró registro PagoMercado para Transacción ${transaccionId}.`,
        );
      }
      if (
        internalStatus === "pagado" &&
        transaccion.estado_transaccion !== "pagado"
      ) {
        await transaccionService.confirmarTransaccion(transaccionId);
        await transaccion.reload();
        console.log(
          `   - Transacción ${transaccionId} CONFIRMADA por refresh.`,
        );
      }
      return {
        transaccion,
        pagoMercado: pagoMercado ? await pagoMercado.reload() : null,
      };
    } catch (error) {
      console.error(
        `❌ Error al refrescar estado de pago ${mpTransactionId}:`,
        error.message,
      );
      return null;
    }
  },
};

module.exports = paymentService;
