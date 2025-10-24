const {
  MercadoPagoConfig,
  Preference,
  Payment,
  MerchantOrder, // El SDK no se usa para Refunds, se usa Axios
} = require("mercadopago");
const { sequelize } = require("../config/database");
const { Transaction } = require("sequelize");
const axios = require("axios"); // ✅ Agregado para llamadas HTTP directas a la API de MP
require("dotenv").config();

// Dependencias de modelos/servicios
const Transaccion = require("../models/transaccion");
const PagoMercado = require("../models/pagoMercado");
const transaccionService = require("../services/transaccion.service");

// MODIFICACIÓN 1: Usar MP_LIVE_ACCESS_TOKEN y añadir MP_TEST_ACCESS_TOKEN
const MP_LIVE_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN; // Usamos la variable existente para el token LIVE
const MP_TEST_ACCESS_TOKEN = process.env.MP_TEST_ACCESS_TOKEN; // Nueva variable para el token TEST
const HOST_URL = (process.env.HOST_URL || "http://localhost:3000").trim();
const CURRENCY_ID = process.env.MP_CURRENCY_ID || "ARS";

// Mapeo de estados MP a estados internos de la aplicación
const MP_STATUS_MAP = {
  approved: "pagado",
  pending: "en_proceso",
  in_process: "pendiente",
  rejected: "rechazado",
  cancelled: "rechazado",
  refunded: "devuelto",
  charged_back: "devuelto",
};

// ✅ SERVICIOS DEL SDK
let client = null;
let preferenceService = null;
let paymentAPI = null;
let merchantOrderService = null;

// --- INICIALIZACIÓN DEL CLIENTE MP ---
if (
  MP_LIVE_ACCESS_TOKEN &&
  MP_LIVE_ACCESS_TOKEN !== "[Pega_aqui_tu_TEST-Access_Token_de_MP]"
) {
  try {
    // MODIFICACIÓN 2: Usar MP_LIVE_ACCESS_TOKEN para el SDK
    client = new MercadoPagoConfig({
      accessToken: MP_LIVE_ACCESS_TOKEN,
      options: { timeout: 5000 },
    });
    preferenceService = new Preference(client);
    paymentAPI = new Payment(client);
    merchantOrderService = new MerchantOrder(client);
    console.log("✅ [MP Service] Mercado Pago SDK configurado.");
    console.log(
      "⚠️ [MP Service] Reembolsos se manejan vía API REST con Axios (fallback)."
    );
  } catch (error) {
    console.error(
      "❌ [MP Service] Error al inicializar Mercado Pago:",
      error.message
    );
  }
} else {
  console.error(
    "⚠️ [MP Service] MP_ACCESS_TOKEN no configurado o es el valor por defecto. El servicio de MP no funcionará."
  );
}

/**
 * Servicio de integración con la pasarela de pagos de Mercado Pago.
 */
const paymentService = {
  /**
   * @async
   * @function createPaymentSession
   * @description Crea una "Preferencia" en Mercado Pago para iniciar el flujo de pago.
   */
  async createPaymentSession(datos, transaccionId) {
    if (!preferenceService) {
      throw new Error(
        "El servicio de Mercado Pago (Preference) no está inicializado."
      );
    }

    const { titulo, monto, id_usuario } = datos;

    try {
      // 🚨 MODIFICACIÓN CLAVE: Lógica para la URL del Webhook
      // Asume que si NODE_ENV no es 'production', debe usar la URL de prueba.
      const isDevOrTest = process.env.NODE_ENV !== "production";

      const webhookPath = isDevOrTest
        ? "/api/payment/webhook/mercadopago" // ⬅️ CAMBIA ESTA URL a tu endpoint de prueba
        : "/api/payment/webhook/mercadopago"; // ⬅️ Deja esta para producción
      const webhookUrl = `${HOST_URL}${webhookPath}`;

      console.log(
        `➡️ [MP Service] Creando preferencia para Transacción ID: ${transaccionId}. Webhook: ${webhookUrl}`
      );

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
        notification_url: webhookUrl, // ⬅️ URL DINÁMICA
        auto_return: "approved",
        statement_descriptor: "PLATAFORMA_INV",
        payer: {
          id: String(id_usuario),
        },
      };

      const idempotencyKey = `${transaccionId}-${Date.now()}`;

      const response = await preferenceService.create({
        body: preferenceBody,
        requestOptions: {
          idempotencyKey: idempotencyKey,
        },
      });

      console.log(
        `✅ [MP Service] Preferencia creada. ID: ${response.id}, URL: ${response.init_point}`
      );

      return {
        preferenceId: response.id,
        redirectUrl: response.init_point,
      };
    } catch (error) {
      console.error(
        "❌ [MP Service] Error al crear preferencia en MP:",
        error.message
      );
      throw new Error(`Fallo al crear preferencia de pago: ${error.message}`);
    }
  },
  /**
   * @async
   * @function verifyAndFetchPayment
   * @description Extrae el ID del pago desde un webhook de MP y obtiene los detalles completos del pago.
   */ // ---------------------------------------------------------------------

  async verifyAndFetchPayment(req, metodo) {
    if (metodo !== "mercadopago" || !paymentAPI) return null;

    const topicType =
      req.query.topic || req.query.type || req.body?.type || req.body?.topic;

    // 💡 Aquí es donde vamos a simplificar y priorizar las estructuras conocidas
    let paymentId =
      req.query.id || // ⬅️ Notificación /notifications?id=123...
      req.query["data.id"] || // ⬅️ Notificación /notifications?topic=payment&data.id=123...
      req.body?.data?.id || // ⬅️ Webhook JSON v2 (si aplica)
      req.body?.resource; // ⬅️ Webhook JSON v2 (si aplica)

    if (typeof paymentId === "string" && paymentId.startsWith("http")) {
      paymentId = paymentId.split("/").pop();
    }

    // ➡️ DEBUG: Imprime el paymentId justo antes de la validación
    console.log(
      `➡️ [MP Service] ID extraído antes de validación: ${paymentId}`
    );

    console.log(
      `➡️ [MP Service] Webhook recibido. Tipo: ${topicType}, ID Pasarela: ${paymentId}`
    );

    // 🛑 La lógica falla aquí: topicType debe ser 'payment' y paymentId no debe ser nulo.
    if (topicType !== "payment" || !paymentId) {
      console.warn(
        `⚠️ [MP Service] Webhook ignorado. Topic: ${topicType}, ID: ${paymentId}`
      );
      return null;
    }

    try {
      const paymentData = await paymentAPI.get({ id: paymentId });
      const transaccionId = paymentData.external_reference;

      console.log(
        `🔍 [MP Service] Pago ID ${paymentId} fetcheado. Ref. Externa: ${transaccionId}, Estado MP: ${paymentData.status}`
      );

      if (!transaccionId) {
        console.warn(
          `⚠️ [MP Service] Pago ID ${paymentId} sin external_reference.`
        );
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
      console.error(
        `❌ [MP Service] Error al fetchear pago ${paymentId}:`,
        error.message
      );
      return null;
    }
  },
  /**
   * @async
   * @function realizarReembolso
   * @description Solicita un reembolso total o parcial del pago a la API de Mercado Pago usando Axios.
   * @returns {object} Resultado del reembolso
   * @throws {Error} Si falla el reembolso
   */ // ---------------------------------------------------------------------

  async realizarReembolso(paymentId, monto = null) {
    console.log(
      `➡️ [MP Service] Solicitando reembolso para Payment ID: ${paymentId}. Monto: ${
        monto ?? "Total"
      }`
    );

    // 🔄 Prioridad de Tokens: Probamos TEST primero (que debe funcionar en Sandbox)
    // Luego probamos LIVE (por si el pago es en Producción)
    const tokens = [
      { name: "TEST", value: MP_TEST_ACCESS_TOKEN }, // ⬅️ Probamos TEST primero
      { name: "LIVE", value: MP_LIVE_ACCESS_TOKEN },
    ];

    let lastError = null;

    for (const { name: tokenName, value: accessToken } of tokens) {
      if (!accessToken) continue;

      try {
        console.log(`   - Intentando reembolso con Token: ${tokenName}`);

        const url = `https://api.mercadopago.com/v1/payments/${paymentId}/refunds`;
        const headers = {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        };
        const body =
          monto !== null && monto !== undefined
            ? { amount: parseFloat(monto) }
            : {};

        // ✅ Llamada directa a la API REST con Axios
        const response = await axios.post(url, body, { headers });

        // Éxito:
        console.log(
          `✅ [MP Service] Reembolso de MP exitoso (${tokenName}) para Payment ID ${paymentId}. Refund ID: ${response.data.id}, Estado: ${response.data.status}`
        );

        return {
          success: true,
          refundId: response.data.id,
          status: response.data.status,
          amount: response.data.amount,
        };
      } catch (error) {
        const errorData = error.response?.data || {};
        lastError = errorData;

        const errorMsg = errorData.message || error.message || "";
        const errorStatus = error.response?.status || error.statusCode;

        // ⚠️ Manejo de errores de credenciales y permisos
        if (
          (errorStatus === 401 || errorStatus === 403) && // 401 (Unauth) o 403 (Forbidden)
          (tokenName === "TEST" || tokenName === "LIVE")
        ) {
          // En tu caso, el token TEST (que tiene el valor LIVE) falla con 401/403.
          // Si falla el primer token, pasamos al siguiente.
          console.warn(
            `   - ⚠️ Fallo con Token ${tokenName} (Status ${errorStatus}). Reintentando con el otro token.`
          );
          continue; // Pasa al siguiente token
        }

        // Manejo de pagos ya reembolsados (400) o no encontrados (404)
        if (
          errorMsg.includes("already refunded") ||
          errorMsg.includes("refunded") ||
          errorStatus === 400 ||
          errorStatus === 404
        ) {
          console.warn(
            `⚠️ [MP Service] El pago ${paymentId} ya fue reembolsado, no puede ser reembolsado o no fue encontrado (Status ${errorStatus}).`
          );
          return {
            success: false,
            alreadyRefunded: true,
            message: "El pago ya fue reembolsado o no puede ser reembolsado",
          };
        }

        // Si es un error diferente, no hay más opciones, lanzamos error
        console.error(
          `❌ [MP Service] Fallo crítico en realizarReembolso con ${tokenName}:`,
          errorData || error.message
        );

        const finalErrorMsg =
          errorData.message ||
          error.message ||
          "Fallo desconocido al solicitar reembolso.";
        throw new Error(
          `Fallo al solicitar reembolso a Mercado Pago: ${finalErrorMsg}`
        );
      }
    }

    // Si llegamos aquí, es porque el bucle terminó sin éxito tras probar ambos.
    if (!MP_LIVE_ACCESS_TOKEN && !MP_TEST_ACCESS_TOKEN) {
      throw new Error("Ningún ACCESS_TOKEN de Mercado Pago está configurado.");
    }

    const finalErrorMsg =
      lastError?.message || "Fallo desconocido tras intentos con ambos tokens.";
    throw new Error(
      `Fallo al solicitar reembolso a Mercado Pago: ${finalErrorMsg}`
    );
  },
  /**
   * @async
   * @function procesarPagosDeMerchantOrder
   * @description Procesa una Merchant Order de Mercado Pago.
   */ // ---------------------------------------------------------------------

  async procesarPagosDeMerchantOrder(merchantOrderId) {
    if (!merchantOrderService) {
      throw new Error(
        "El servicio de MerchantOrder no está inicializado. Revise MP_ACCESS_TOKEN."
      );
    }

    console.log(
      `➡️ [MP Service] Procesando Merchant Order ID: ${merchantOrderId}`
    );

    const t = await sequelize.transaction({
      isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED,
    });

    try {
      const merchantOrderData = await merchantOrderService.get({
        id: String(merchantOrderId),
      });

      const transaccionId = parseInt(merchantOrderData.external_reference);

      console.log(
        `🔍 [MP Service] MO ${merchantOrderId} asociada a Transacción ID: ${transaccionId}. Pagos en MO: ${merchantOrderData.payments.length}`
      );

      if (!transaccionId) {
        throw new Error(
          "Merchant Order sin referencia de Transacción externa."
        );
      }

      for (const mpPayment of merchantOrderData.payments) {
        const internalStatus = MP_STATUS_MAP[mpPayment.status];

        console.log(
          `   - [MP Payment] ID: ${mpPayment.id}, Estado MP: ${mpPayment.status} -> Estado Interno: ${internalStatus}`
        );

        if (
          internalStatus === "pagado" ||
          internalStatus === "rechazado" ||
          internalStatus === "devuelto"
        ) {
          let transaccion = await Transaccion.findByPk(transaccionId, {
            transaction: t,
            lock: t.LOCK.UPDATE,
          });

          if (!transaccion) {
            console.warn(
              `   - [MP Payment] Transacción ${transaccionId} no encontrada.`
            );
            continue;
          }

          if (
            transaccion.estado_transaccion === "pagado" ||
            transaccion.estado_transaccion === "fallido"
          ) {
            console.log(
              `   - [MP Payment] Transacción ${transaccionId} ya en estado final (${transaccion.estado_transaccion}). Saltando...`
            );
            continue;
          }

          let pagoMercado = await PagoMercado.findOne({
            where: { id_transaccion_pasarela: mpPayment.id },
            transaction: t,
          });

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
            console.log(
              `   - [MP Payment] Pago Mercado creado (ID: ${pagoMercado.id}, Estado: ${internalStatus})`
            );

            if (!transaccion.id_pago_pasarela) {
              await transaccion.update(
                { id_pago_pasarela: pagoMercado.id },
                { transaction: t }
              );
              console.log(
                `   - [MP Payment] Actualizada Transacción ${transaccionId} con id_pago_pasarela.`
              );
            }
          } else {
            await pagoMercado.update(
              { estado: internalStatus },
              { transaction: t }
            );
            console.log(
              `   - [MP Payment] Pago Mercado actualizado (ID: ${pagoMercado.id}, Nuevo Estado: ${internalStatus})`
            );
          }

          if (internalStatus === "pagado") {
            await transaccionService.confirmarTransaccion(transaccionId, {
              transaction: t,
            });
            console.log(
              `   - [MP Payment] Transacción ${transaccionId} CONFIRMADA.`
            );
          } else if (internalStatus === "rechazado") {
            await transaccionService.procesarFalloTransaccion(
              transaccionId,
              "fallido",
              "Rechazado por MO",
              {
                transaction: t,
              }
            );
            console.log(
              `   - [MP Payment] Transacción ${transaccionId} FALLIDA (Rechazada).`
            );
          } else if (internalStatus === "devuelto") {
            await transaccionService.procesarFalloTransaccion(
              transaccionId,
              "reembolsado",
              "Devuelto por MO",
              {
                transaction: t,
              }
            );
            console.log(
              `   - [MP Payment] Transacción ${transaccionId} REEMBOLSADA.`
            );
          }
        }
      }

      await t.commit();
      console.log(
        `✅ [MP Service] Merchant Order ${merchantOrderId} procesada y transacción commiteada.`
      );
    } catch (error) {
      await t.rollback();
      console.error(
        `❌ [MP Service] Error CRÍTICO al procesar Merchant Order ${merchantOrderId}:`,
        error.message
      );
      throw error;
    }
  },
  /**
   * @async
   * @function refreshPaymentStatus
   * @description Consulta el estado actual de un pago de MP y actualiza los registros internos.
   */ // ---------------------------------------------------------------------

  async refreshPaymentStatus(transaccionId, mpTransactionId) {
    if (!paymentAPI) return null;

    console.log(
      `➡️ [MP Service] Refrescando estado para Transacción ID: ${transaccionId}, Pago MP ID: ${mpTransactionId}`
    );

    try {
      const paymentData = await paymentAPI.get({ id: mpTransactionId });
      const transaccion = await Transaccion.findByPk(transaccionId);

      if (!transaccion) {
        console.warn(
          `⚠️ [MP Service] Transacción ${transaccionId} no encontrada para refresh.`
        );
        return null;
      }

      let pagoMercado = await PagoMercado.findOne({
        where: { id_transaccion: transaccionId },
      });

      const internalStatus = MP_STATUS_MAP[paymentData.status] || "en_proceso";

      console.log(
        `🔍 [MP Service] Estado actual MP: ${paymentData.status} -> Interno: ${internalStatus}. Estado Transacción: ${transaccion.estado_transaccion}`
      );

      const pagoData = {
        estado: internalStatus,
        tipo_medio_pago: paymentData.payment_type_id,
        fecha_aprobacion: paymentData.date_approved,
        detalles_raw: paymentData,
      };

      if (pagoMercado) {
        await pagoMercado.update(pagoData);
        console.log(
          `   - [MP Service] Pago Mercado ${pagoMercado.id} actualizado.`
        );
      } else {
        console.warn(
          `   - [MP Service] No se encontró registro PagoMercado para Transacción ${transaccionId}.`
        );
      }

      if (
        internalStatus === "pagado" &&
        transaccion &&
        transaccion.estado_transaccion !== "pagado"
      ) {
        await transaccionService.confirmarTransaccion(transaccionId);
        await transaccion.reload();
        console.log(
          `   - [MP Service] Transacción ${transaccionId} CONFIRMADA por refresh.`
        );
      }

      return {
        transaccion,
        pagoMercado: pagoMercado ? await pagoMercado.reload() : null,
      };
    } catch (error) {
      console.error(
        `❌ [MP Service] Error al refrescar estado de pago ${mpTransactionId}:`,
        error.message
      );
      return null;
    }
  },
};

module.exports = paymentService;
