// Archivo: services/dlocal.service.js
// Pasarela dLocal Go (cobros en USD). Cumple el mismo contrato que pagoMercado.service.js
// (ver services/pasarela.registry.js). Reutiliza el modelo PagoMercado como registro
// genérico de pagos de pasarela (metodo_pasarela = "dlocal").
//
// ⚠️ VERIFICAR EN SANDBOX antes de producción (no confirmado contra docs oficiales):
//   1. Formato del header Authorization (aquí: Bearer <API_KEY>:<API_SECRET>).
//   2. Nombres de campos del payload de creación y de la respuesta.
//   3. Existencia de API de reembolsos (aquí se resuelve de forma manual).

const axios = require("axios");
const { sequelize } = require("../config/database");
const Transaccion = require("../models/transaccion");
const PagoMercado = require("../models/pagoMercado");
require("dotenv").config();

const DLOCAL_API_KEY = process.env.DLOCAL_API_KEY;
const DLOCAL_API_SECRET = process.env.DLOCAL_API_SECRET;
const DLOCAL_BASE_URL = (
  process.env.DLOCAL_BASE_URL || "https://api.dlocalgo.com"
).trim();
const DLOCAL_WEBHOOK_TOKEN = process.env.DLOCAL_WEBHOOK_TOKEN || null;
const HOST_URL = (process.env.HOST_URL || "http://localhost:3000").trim();
const MONEDAS_SOPORTADAS = ["USD", "ARS"];
const TOLERANCIA_MONTO = 0.01;

// Estados de dLocal → enum de PagoMercado.estado
const DLOCAL_STATUS_MAP = Object.freeze({
  PAID: "aprobado",
  PENDING: "en_proceso",
  REJECTED: "rechazado",
  CANCELLED: "rechazado",
  EXPIRED: "rechazado",
  REFUNDED: "devuelto",
});

const http = axios.create({ baseURL: DLOCAL_BASE_URL, timeout: 10000 });

function authHeaders(extra = {}) {
  if (!DLOCAL_API_KEY || !DLOCAL_API_SECRET) {
    throw new Error("dLocal no configurado: faltan DLOCAL_API_KEY / DLOCAL_API_SECRET.");
  }
  return {
    Authorization: `Bearer ${DLOCAL_API_KEY}:${DLOCAL_API_SECRET}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

function mapearEstado(statusRaw) {
  return DLOCAL_STATUS_MAP[String(statusRaw || "").toUpperCase()] || "en_proceso";
}

/** El pago de la pasarela debe coincidir en monto y moneda con nuestra transacción. */
function coincideConTransaccion(paymentData, transaccion) {
  const mismaMoneda = paymentData.currency === transaccion.moneda;
  const mismoMonto =
    Math.abs(Number(paymentData.amount) - Number(transaccion.monto)) <= TOLERANCIA_MONTO;
  return mismaMoneda && mismoMonto;
}

function logMismatch(paymentData, transaccion) {
  console.error(
    `🚨 [dLocal] Pago ${paymentData.id} NO coincide con la transacción ${transaccion.id}: ` +
      `recibido ${paymentData.amount} ${paymentData.currency}, esperado ${transaccion.monto} ${transaccion.moneda}. ` +
      `No se confirma: requiere revisión manual.`,
  );
}

const dlocalService = {
  DLOCAL_STATUS_MAP,
  mapearEstado,

  /** Valida el token opcional de la notification_url. */
  esWebhookAutorizado(req) {
    if (!DLOCAL_WEBHOOK_TOKEN) return true;
    return req.query?.token === DLOCAL_WEBHOOK_TOKEN;
  },

  async createPaymentSession(datos, transaccionId) {
    const { monto, moneda, titulo, nombre_usuario, apellido_usuario, email_usuario, documento } =
      datos;

    if (!MONEDAS_SOPORTADAS.includes(moneda)) {
      throw new Error(`Moneda no soportada por dLocal: ${moneda}`);
    }
    if (!monto || isNaN(monto) || monto <= 0) {
      throw new Error(`Monto inválido recibido: ${monto}`);
    }

    const notificationUrl =
      `${HOST_URL}/api/payment/webhook/dlocal` +
      (DLOCAL_WEBHOOK_TOKEN ? `?token=${encodeURIComponent(DLOCAL_WEBHOOK_TOKEN)}` : "");

    const payload = {
      amount: Number(monto),
      currency: moneda,
      country: "AR",
      order_id: String(transaccionId),
      description: titulo,
      payer: {
        name: `${nombre_usuario || ""} ${apellido_usuario || ""}`.trim() || undefined,
        email: email_usuario || undefined,
        document: documento ? String(documento) : undefined,
      },
      // Reutiliza las rutas de redirección existentes (routes/redireccion.routes.js)
      success_url: `${HOST_URL}/pago/exito/${transaccionId}`,
      back_url: `${HOST_URL}/pago/fallo/${transaccionId}`,
      notification_url: notificationUrl,
    };

    try {
      const { data } = await http.post("/v1/payments", payload, {
        headers: authHeaders(),
      });
      const redirectUrl = data.redirect_url || data.checkout_url;
      if (!data.id || !redirectUrl) {
        throw new Error("Respuesta de dLocal sin id o redirect_url.");
      }
      console.log(`✅ [dLocal] Pago creado. ID: ${data.id}`);
      return { preferenceId: String(data.id), redirectUrl };
    } catch (err) {
      const detalle = err.response?.data?.message || err.message;
      console.error("❌ [dLocal] Error creando pago:", err.response?.data || err.message);
      throw new Error(`Fallo al crear pago en dLocal: ${detalle}`);
    }
  },

  async fetchPayment(paymentId) {
    const { data } = await http.get(`/v1/payments/${encodeURIComponent(paymentId)}`, {
      headers: authHeaders(),
    });
    return data;
  },

  /**
   * La notificación de dLocal solo trae `payment_id` y NO es confiable por sí sola:
   * siempre se consulta el pago a la API con nuestras credenciales.
   */
  async verifyAndFetchPayment(req) {
    const paymentId = req.body?.payment_id || req.query?.payment_id;
    if (!paymentId) {
      console.warn("⚠️ [dLocal] Webhook sin payment_id, ignorado.");
      return null;
    }

    try {
      const paymentData = await this.fetchPayment(paymentId);
      const transaccionId = parseInt(paymentData.order_id, 10);
      if (!transaccionId) {
        console.warn(`⚠️ [dLocal] Pago ${paymentId} sin order_id.`);
        return null;
      }

      const status = String(paymentData.status || "").toUpperCase();
      if (status === "PAID") {
        const transaccion = await Transaccion.findByPk(transaccionId);
        if (!transaccion) return null;
        if (!coincideConTransaccion(paymentData, transaccion)) {
          logMismatch(paymentData, transaccion);
          return null;
        }
      }

      return {
        transaccionId,
        status,
        transactionId: paymentData.id,
        paymentDetails: {
          transaction_amount: paymentData.amount,
          currency: paymentData.currency,
          payment_method_type: paymentData.payment_method_type || paymentData.payment_method?.type,
          date_approved: paymentData.approved_date || paymentData.paid_at || null,
        },
        rawDetails: paymentData,
      };
    } catch (err) {
      console.error(`❌ [dLocal] Error consultando pago ${paymentId}:`, err.message);
      return null;
    }
  },

  /**
   * Reembolso: no hay API confirmada → se deja para gestión manual. El controlador
   * ya notifica a usuario y admins cuando success !== true.
   */
  async realizarReembolso(paymentId) {
    console.warn(`⚠️ [dLocal] Reembolso del pago ${paymentId} requiere gestión manual en el panel de dLocal Go.`);
    return {
      success: false,
      manual: true,
      message: `Reembolso manual requerido en dLocal Go (pago ${paymentId}).`,
    };
  },

  async refreshPaymentStatus(transaccionId, paymentId) {
    const transaccionService = require("./transaccion.service");

    let paymentData;
    try {
      paymentData = await this.fetchPayment(paymentId);
    } catch (err) {
      console.error(`❌ [dLocal] Error obteniendo pago ${paymentId}:`, err.message);
      return null;
    }

    const transaccion = await Transaccion.findByPk(transaccionId);
    if (!transaccion) return null;

    const internalStatus = mapearEstado(paymentData.status);
    if (internalStatus === "aprobado" && !coincideConTransaccion(paymentData, transaccion)) {
      logMismatch(paymentData, transaccion);
      return null;
    }

    const pagoData = {
      estado: internalStatus,
      tipo_medio_pago: paymentData.payment_method_type || paymentData.payment_method?.type || null,
      fecha_aprobacion: paymentData.approved_date || paymentData.paid_at || null,
      detalles_raw: paymentData,
    };

    let pagoMercado = await PagoMercado.findOne({
      where: { id_transaccion: transaccionId, metodo_pasarela: "dlocal" },
    });

    try {
      if (pagoMercado) {
        await pagoMercado.update(pagoData);
      } else {
        pagoMercado = await PagoMercado.create({
          id_transaccion: transaccionId,
          monto_pagado: Number(paymentData.amount || transaccion.monto).toFixed(2),
          moneda: paymentData.currency || transaccion.moneda,
          metodo_pasarela: "dlocal",
          id_transaccion_pasarela: String(paymentId),
          ...pagoData,
        });
        await transaccion.update({ id_pago_pasarela: pagoMercado.id });
      }
    } catch (err) {
      console.error(`❌ [dLocal] Error guardando pago de transacción ${transaccionId}:`, err.message);
      return null;
    }

    if (internalStatus === "aprobado" && transaccion.estado_transaccion !== "pagado") {
      const t = await sequelize.transaction();
      try {
        await transaccionService.confirmarTransaccion(transaccionId, { transaction: t });
        await t.commit();
        await transaccion.reload();
      } catch (err) {
        await t.rollback();
        console.error(`❌ [dLocal] Error confirmando transacción ${transaccionId}:`, err.message);
        return null;
      }
    }

    return { transaccion, pagoMercado };
  },
};

module.exports = dlocalService;
