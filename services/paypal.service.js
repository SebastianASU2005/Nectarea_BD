// Archivo: services/paypal.service.js
// Pasarela PayPal (Orders API v2) para cobros en USD. Cumple el mismo contrato que
// pagoMercado.service.js (ver services/pasarela.registry.js) y reutiliza el modelo
// PagoMercado como registro genérico de pagos (metodo_pasarela = "paypal").
//
// DIFERENCIA CLAVE con Mercado Pago: en PayPal el usuario solo APRUEBA la orden; el
// cobro real ocurre cuando el servidor la CAPTURA. La captura se dispara desde:
//   1) el retorno del usuario (redireccion.controller → refreshPaymentStatus),
//   2) el webhook CHECKOUT.ORDER.APPROVED (respaldo si el usuario cierra el navegador).
// Nunca se captura una orden cuya transacción ya está en estado final: así un pago
// aprobado tarde simplemente no se cobra (no hace falta reembolsar).
//
// IDs: se usa el ID de la ORDEN de PayPal como id_transaccion_pasarela; la captura
// (necesaria para reembolsos) se obtiene de la orden.

const axios = require("axios");
const crypto = require("crypto");
const { sequelize } = require("../config/database");
const Transaccion = require("../models/transaccion");
const PagoMercado = require("../models/pagoMercado");
require("dotenv").config();
const { buildServerReturnUrls } = require("../config/paymentUrls");

const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET;
const PAYPAL_ENV = (process.env.PAYPAL_ENV || "sandbox").toLowerCase(); // sandbox | live
// Acepta PAYPAL_WEBHOOK_ID o la variante por entorno (_SANDBOX / _LIVE)
const PAYPAL_WEBHOOK_ID =
  process.env.PAYPAL_WEBHOOK_ID ||
  (PAYPAL_ENV === "live"
    ? process.env.PAYPAL_WEBHOOK_ID_LIVE
    : process.env.PAYPAL_WEBHOOK_ID_SANDBOX);
const PAYPAL_BRAND_NAME = process.env.PAYPAL_BRAND_NAME || "Loteplan";
const HOST_URL = (process.env.HOST_URL || "http://localhost:3000").trim();

const PAYPAL_BASE_URL =
  PAYPAL_ENV === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";

const MONEDAS_SOPORTADAS = ["USD"];
const TOLERANCIA_MONTO = 0.01;
const ESTADOS_FINALES = ["pagado", "fallido", "reembolsado", "expirado"];

// Eventos de webhook que procesamos (el resto se ignora)
const EVENTO_ORDEN_APROBADA = "CHECKOUT.ORDER.APPROVED";
const EVENTOS_CAPTURA = [
  "PAYMENT.CAPTURE.COMPLETED",
  "PAYMENT.CAPTURE.PENDING",
  "PAYMENT.CAPTURE.DENIED",
  "PAYMENT.CAPTURE.REFUNDED",
];

// Estado de captura/orden de PayPal → enum de PagoMercado.estado
const PAYPAL_STATUS_MAP = Object.freeze({
  COMPLETED: "aprobado",
  PARTIALLY_REFUNDED: "aprobado", // reembolso parcial: el cobro sigue vigente
  PENDING: "en_proceso",
  APPROVED: "en_proceso", // aprobada, aún sin capturar
  CREATED: "pendiente", // el usuario todavía no aprobó
  SAVED: "pendiente",
  PAYER_ACTION_REQUIRED: "pendiente",
  DECLINED: "rechazado",
  FAILED: "rechazado",
  VOIDED: "rechazado",
  REFUNDED: "devuelto",
});

const http = axios.create({ baseURL: PAYPAL_BASE_URL, timeout: 15000 });

// ---------------------------------------------------------------------------
// Autenticación (OAuth2 client_credentials con caché en memoria)
// ---------------------------------------------------------------------------
let tokenCache = { value: null, expiresAt: 0 };

async function getAccessToken(forzar = false) {
  if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
    throw new Error(
      "PayPal no configurado: faltan PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET.",
    );
  }
  if (!forzar && tokenCache.value && Date.now() < tokenCache.expiresAt) {
    return tokenCache.value;
  }
  const basic = Buffer.from(
    `${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`,
  ).toString("base64");
  const { data } = await http.post(
    "/v1/oauth2/token",
    "grant_type=client_credentials",
    {
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    },
  );
  tokenCache = {
    value: data.access_token,
    expiresAt: Date.now() + (Number(data.expires_in) - 60) * 1000,
  };
  return tokenCache.value;
}

/** Request autenticado; ante un 401 renueva el token y reintenta una vez. */
async function paypalRequest(method, path, { data, headers = {} } = {}) {
  const ejecutar = async (forzar) => {
    const token = await getAccessToken(forzar);
    return http.request({
      method,
      url: path,
      data,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...headers,
      },
    });
  };
  try {
    return await ejecutar(false);
  } catch (err) {
    if (err.response?.status === 401) return ejecutar(true);
    throw err;
  }
}

/** Código de negocio de un error 4xx de PayPal (p. ej. ORDER_ALREADY_CAPTURED). */
function issueDe(err) {
  return (
    err.response?.data?.details?.[0]?.issue || err.response?.data?.name || null
  );
}

// ---------------------------------------------------------------------------
// Helpers de dominio
// ---------------------------------------------------------------------------
function mapearEstado(statusRaw) {
  return (
    PAYPAL_STATUS_MAP[String(statusRaw || "").toUpperCase()] || "en_proceso"
  );
}

function extraerCaptura(order) {
  return order?.purchase_units?.[0]?.payments?.captures?.[0] || null;
}

/** Estado "efectivo": el de la captura si existe; si no, el de la orden. */
function estadoDeOrden(order) {
  const captura = extraerCaptura(order);
  if (captura?.status) return String(captura.status).toUpperCase();
  return String(order?.status || "").toUpperCase();
}

function coincideConTransaccion({ value, currency_code }, transaccion) {
  return (
    currency_code === transaccion.moneda &&
    Math.abs(Number(value) - Number(transaccion.monto)) <= TOLERANCIA_MONTO
  );
}

function logMismatch(orderId, monto, transaccion) {
  console.error(
    `🚨 [PayPal] Orden ${orderId} NO coincide con la transacción ${transaccion.id}: ` +
      `recibido ${monto?.value} ${monto?.currency_code}, esperado ${transaccion.monto} ${transaccion.moneda}. ` +
      `No se confirma: requiere revisión manual.`,
  );
}

// ---------------------------------------------------------------------------
// Servicio
// ---------------------------------------------------------------------------
const paypalService = {
  PAYPAL_STATUS_MAP,
  mapearEstado,
  /** El usuario vuelve del checkout con la orden solo "aprobada": hay que capturarla. */
  requiereCapturaAlRetorno: true,

  async createPaymentSession(datos, transaccionId) {
    const { monto, moneda, titulo } = datos;

    if (!MONEDAS_SOPORTADAS.includes(moneda)) {
      throw new Error(
        `Moneda no soportada por PayPal en este sistema: ${moneda}`,
      );
    }
    if (!monto || isNaN(monto) || monto <= 0) {
      throw new Error(`Monto inválido recibido: ${monto}`);
    }

    const returnUrls = buildServerReturnUrls(transaccionId);

    const payload = {
      intent: "CAPTURE",
      purchase_units: [
        {
          custom_id: String(transaccionId), // vuelve en orden, captura y webhooks
          description: String(titulo || `Transacción ${transaccionId}`).slice(
            0,
            127,
          ),
          amount: { currency_code: moneda, value: Number(monto).toFixed(2) },
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            brand_name: PAYPAL_BRAND_NAME,
            user_action: "PAY_NOW",
            shipping_preference: "NO_SHIPPING",
            payment_method_preference: "IMMEDIATE_PAYMENT_REQUIRED",
            // Vuelve al BACKEND (config/paymentUrls.js): esa ruta captura el pago y
            // luego redirige al frontend. Funciona aunque el front no esté desplegado.
            return_url: returnUrls.success,
            cancel_url: returnUrls.failure,
          },
        },
      },
    };

    try {
      const { data } = await paypalRequest("POST", "/v2/checkout/orders", {
        data: payload,
        // Cada checkout generado es una orden nueva
        headers: { "PayPal-Request-Id": crypto.randomUUID() },
      });
      const link = (data.links || []).find(
        (l) => l.rel === "payer-action" || l.rel === "approve",
      );
      if (!data.id || !link?.href) {
        throw new Error("Respuesta de PayPal sin id o link de aprobación.");
      }
      console.log(`✅ [PayPal] Orden creada. ID: ${data.id}`);
      return { preferenceId: data.id, redirectUrl: link.href };
    } catch (err) {
      const detalle =
        err.response?.data?.details?.[0]?.description ||
        err.response?.data?.message ||
        err.message;
      console.error(
        "❌ [PayPal] Error creando orden:",
        err.response?.data || err.message,
      );
      throw new Error(`Fallo al crear orden en PayPal: ${detalle}`);
    }
  },

  async fetchOrder(orderId) {
    const { data } = await paypalRequest(
      "GET",
      `/v2/checkout/orders/${encodeURIComponent(orderId)}`,
    );
    return data;
  },

  /**
   * Captura la orden aprobada. Idempotente: PayPal-Request-Id fijo por orden y
   * tolerancia a ORDER_ALREADY_CAPTURED (webhook y retorno pueden competir).
   */
  async captureOrder(orderId) {
    try {
      const { data } = await paypalRequest(
        "POST",
        `/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`,
        { data: {}, headers: { "PayPal-Request-Id": `capture-${orderId}` } },
      );
      return data;
    } catch (err) {
      const issue = issueDe(err);
      if (issue === "ORDER_ALREADY_CAPTURED") return this.fetchOrder(orderId);
      if (issue === "INSTRUMENT_DECLINED") {
        // Fondos/medio de pago rechazado: se trata como pago rechazado
        const order = await this.fetchOrder(orderId);
        order.status = "VOIDED";
        return order;
      }
      throw err;
    }
  },

  /**
   * Núcleo común (webhook y refresh): trae la orden, valida contra nuestra
   * transacción y, si corresponde, la captura.
   * @returns {Promise<{transaccionId, status, transactionId, paymentDetails, rawDetails}|null>}
   */
  async resolverOrden(orderId, { capturar }) {
    let order = await this.fetchOrder(orderId);

    const unidad = order.purchase_units?.[0];
    const transaccionId = parseInt(unidad?.custom_id, 10);
    if (!transaccionId) {
      console.warn(`⚠️ [PayPal] Orden ${orderId} sin custom_id.`);
      return null;
    }
    const transaccion = await Transaccion.findByPk(transaccionId);
    if (!transaccion) return null;

    if (capturar && order.status === "APPROVED" && !extraerCaptura(order)) {
      if (ESTADOS_FINALES.includes(transaccion.estado_transaccion)) {
        console.warn(
          `⏭️ [PayPal] Orden ${orderId} aprobada pero la transacción ${transaccionId} ya está '${transaccion.estado_transaccion}'. No se captura (no se cobra).`,
        );
        return null;
      }
      if (!coincideConTransaccion(unidad.amount, transaccion)) {
        logMismatch(orderId, unidad.amount, transaccion);
        return null;
      }
      order = await this.captureOrder(orderId);
    }

    const status = estadoDeOrden(order);
    const captura = extraerCaptura(order);

    if (
      status === "COMPLETED" &&
      !coincideConTransaccion(captura.amount, transaccion)
    ) {
      logMismatch(orderId, captura.amount, transaccion);
      return null;
    }

    return {
      transaccionId,
      status,
      transactionId: order.id,
      paymentDetails: {
        transaction_amount: captura?.amount?.value ?? unidad?.amount?.value,
        currency:
          captura?.amount?.currency_code ?? unidad?.amount?.currency_code,
        payment_method_type: "paypal",
        date_approved: captura?.create_time || null,
      },
      rawDetails: order,
    };
  },

  /**
   * Verifica el origen del webhook con la API de PayPal (firma). Requiere
   * PAYPAL_WEBHOOK_ID; en sandbox sin configurar se permite con advertencia.
   */
  async esWebhookAutorizado(req) {
    if (!PAYPAL_WEBHOOK_ID) {
      if (PAYPAL_ENV !== "live") {
        console.warn(
          "⚠️ [PayPal] PAYPAL_WEBHOOK_ID no configurado: firma NO verificada (solo sandbox).",
        );
        return true;
      }
      console.error(
        "🚫 [PayPal] PAYPAL_WEBHOOK_ID no configurado en live. Webhook rechazado.",
      );
      return false;
    }
    try {
      const h = req.headers;
      const { data } = await paypalRequest(
        "POST",
        "/v1/notifications/verify-webhook-signature",
        {
          data: {
            auth_algo: h["paypal-auth-algo"],
            cert_url: h["paypal-cert-url"],
            transmission_id: h["paypal-transmission-id"],
            transmission_sig: h["paypal-transmission-sig"],
            transmission_time: h["paypal-transmission-time"],
            webhook_id: PAYPAL_WEBHOOK_ID,
            webhook_event: req.body,
          },
        },
      );
      return data.verification_status === "SUCCESS";
    } catch (err) {
      console.error(
        "❌ [PayPal] Error verificando firma de webhook:",
        err.response?.data || err.message,
      );
      return false;
    }
  },

  async verifyAndFetchPayment(req) {
    const evento = req.body;
    const tipo = evento?.event_type;
    const recurso = evento?.resource;

    let orderId = null;
    let capturar = false;
    if (tipo === EVENTO_ORDEN_APROBADA) {
      orderId = recurso?.id;
      capturar = true;
    } else if (EVENTOS_CAPTURA.includes(tipo)) {
      orderId = recurso?.supplementary_data?.related_ids?.order_id;
    }
    if (!orderId) {
      console.log(`ℹ️ [PayPal] Evento ignorado: ${tipo || "sin tipo"}`);
      return null;
    }

    try {
      return await this.resolverOrden(orderId, { capturar });
    } catch (err) {
      console.error(
        `❌ [PayPal] Error resolviendo orden ${orderId}:`,
        err.response?.data || err.message,
      );
      return null;
    }
  },

  /**
   * @param {string} orderId  ID de la orden (id_transaccion_pasarela)
   * @param {number} monto    monto a devolver (total del cobro)
   */
  async realizarReembolso(orderId, monto) {
    try {
      const order = await this.fetchOrder(orderId);
      const captura = extraerCaptura(order);
      if (!captura) {
        return {
          success: false,
          message: `La orden ${orderId} no tiene una captura para reembolsar.`,
        };
      }
      const { data } = await paypalRequest(
        "POST",
        `/v2/payments/captures/${captura.id}/refund`,
        {
          data: {
            amount: {
              value: Number(monto ?? captura.amount.value).toFixed(2),
              currency_code: captura.amount.currency_code,
            },
            note_to_payer: "Reembolso por pago duplicado o fuera de término.",
          },
          headers: { "PayPal-Request-Id": `refund-${captura.id}` },
        },
      );
      const estado = String(data.status || "").toUpperCase();
      if (estado === "COMPLETED") return { success: true };
      if (estado === "PENDING") return { success: true, pending: true };
      return { success: false, message: `Reembolso en estado ${estado}` };
    } catch (err) {
      if (issueDe(err) === "CAPTURE_FULLY_REFUNDED")
        return { success: false, alreadyRefunded: true };
      const detalle =
        err.response?.data?.details?.[0]?.description || err.message;
      console.error(
        "❌ [PayPal] Error en reembolso:",
        err.response?.data || err.message,
      );
      return { success: false, message: detalle };
    }
  },

  async refreshPaymentStatus(transaccionId, orderId) {
    const transaccionService = require("./transaccion.service");

    let resolved;
    try {
      resolved = await this.resolverOrden(orderId, { capturar: true });
    } catch (err) {
      console.error(
        `❌ [PayPal] Error obteniendo orden ${orderId}:`,
        err.response?.data || err.message,
      );
      return null;
    }
    if (!resolved || resolved.transaccionId !== Number(transaccionId))
      return null;

    const transaccion = await Transaccion.findByPk(transaccionId);
    if (!transaccion) return null;

    const internalStatus = mapearEstado(resolved.status);
    const pagoData = {
      estado: internalStatus,
      tipo_medio_pago: "paypal",
      fecha_aprobacion: resolved.paymentDetails.date_approved,
      detalles_raw: resolved.rawDetails,
    };

    let pagoMercado = await PagoMercado.findOne({
      where: { id_transaccion: transaccionId, metodo_pasarela: "paypal" },
    });

    try {
      if (pagoMercado) {
        await pagoMercado.update(pagoData);
      } else {
        pagoMercado = await PagoMercado.create({
          id_transaccion: transaccionId,
          monto_pagado: Number(
            resolved.paymentDetails.transaction_amount || transaccion.monto,
          ).toFixed(2),
          moneda: resolved.paymentDetails.currency || transaccion.moneda,
          metodo_pasarela: "paypal",
          id_transaccion_pasarela: String(orderId),
          ...pagoData,
        });
        await transaccion.update({ id_pago_pasarela: pagoMercado.id });
      }
    } catch (err) {
      console.error(
        `❌ [PayPal] Error guardando pago de transacción ${transaccionId}:`,
        err.message,
      );
      return null;
    }

    if (
      internalStatus === "aprobado" &&
      transaccion.estado_transaccion !== "pagado"
    ) {
      const t = await sequelize.transaction();
      try {
        await transaccionService.confirmarTransaccion(transaccionId, {
          transaction: t,
        });
        await t.commit();
        await transaccion.reload();
      } catch (err) {
        await t.rollback();
        console.error(
          `❌ [PayPal] Error confirmando transacción ${transaccionId}:`,
          err.message,
        );
        return null;
      }
    }

    return { transaccion, pagoMercado };
  },
};

module.exports = paypalService;