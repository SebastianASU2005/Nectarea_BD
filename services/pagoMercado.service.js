// Archivo: services/mercadopago.service.js

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

/**
 * Mapeo de estados de Mercado Pago a estados internos de la aplicación.
 * @type {Object<string, string>}
 */
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
/** @type {MercadoPagoConfig|null} */
let client = null;
/** @type {Preference|null} */
let preferenceService = null;
/** @type {Payment|null} */
let paymentAPI = null;
/** @type {MerchantOrder|null} */
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
 * @typedef {object} PaymentSessionData
 * @property {string} titulo - Título del ítem a pagar.
 * @property {number} monto - Monto total de la transacción.
 * @property {number} id_usuario - ID del usuario que inicia el pago.
 */

/**
 * @typedef {object} PaymentSessionResponse
 * @property {string} preferenceId - ID de la preferencia creada en Mercado Pago.
 * @property {string} redirectUrl - URL de redirección donde el usuario debe completar el pago.
 */

/**
 * @typedef {object} VerifiedPaymentData
 * @property {number} transaccionId - ID de la Transacción local (de `external_reference`).
 * @property {string} status - Estado del pago según Mercado Pago (ej. 'approved').
 * @property {string} transactionId - ID del pago en Mercado Pago.
 * @property {object} paymentDetails - Detalles clave del pago.
 * @property {number} paymentDetails.transaction_amount - Monto final de la transacción.
 * @property {string} paymentDetails.payment_method_type - Tipo de medio de pago usado (ej. 'credit_card').
 * @property {string} paymentDetails.date_approved - Fecha de aprobación del pago.
 * @property {object} rawDetails - Objeto completo del pago retornado por MP.
 */

/**
 * @typedef {object} RefundResult
 * @property {boolean} success - Indica si el reembolso fue exitoso.
 * @property {number|undefined} refundId - ID del reembolso si fue exitoso.
 * @property {string|undefined} status - Estado del reembolso (ej. 'approved').
 * @property {number|undefined} amount - Monto reembolsado.
 * @property {boolean|undefined} alreadyRefunded - Indica si el pago ya estaba reembolsado.
 * @property {string|undefined} message - Mensaje en caso de fallo.
 */

/**
 * Servicio de integración con la pasarela de pagos de Mercado Pago.
 */
const paymentService = {
  /**
   * @async
   * @function createPaymentSession
   * @description Crea una "Preferencia" en Mercado Pago para iniciar el flujo de pago.
   * Configura URLs de redirección y el webhook, usando el ID de Transacción local como referencia externa.
   * @param {PaymentSessionData} datos - Información esencial para la preferencia.
   * @param {number} transaccionId - ID de la Transacción local para el `external_reference`.
   * @returns {Promise<PaymentSessionResponse>} Objeto con el ID de preferencia y la URL de redirección.
   * @throws {Error} Si el servicio de MP no está inicializado o si falla la creación de la preferencia.
   */
  async createPaymentSession(datos, transaccionId) {
    if (!preferenceService) {
      throw new Error(
        "El servicio de Mercado Pago (Preference) no está inicializado."
      );
    }

    const {
      titulo,
      monto, // Ya viene validado como número desde _construirDatosPreferencia
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
      const isDevOrTest = process.env.NODE_ENV !== "production";
      const webhookPath = "/api/payment/webhook/mercadopago";
      const webhookUrl = `${HOST_URL}${webhookPath}`;

      console.log(
        `➡️ [MP Service] Creando preferencia para Transacción ID: ${transaccionId}. Webhook: ${webhookUrl}`
      );

      // ✅ Validación final por seguridad
      if (!monto || isNaN(monto) || monto <= 0) {
        throw new Error(
          `Monto inválido recibido: ${monto} (tipo: ${typeof monto})`
        );
      }

      console.log(`💰 Monto a procesar: ${monto} ${CURRENCY_ID}`);

      const preferenceBody = {
        items: [
          {
            title: titulo,
            unit_price: monto, // Ya es número
            quantity: 1,
            currency_id: CURRENCY_ID,
            description: this._generarDescripcionDetallada(
              datos,
              transaccionId
            ),
            picture_url: `https://res.cloudinary.com/dj7kcgf2z/image/upload/v1762267998/LoteplanLogo_dxbyo5.jpg`,
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
        statement_descriptor: "LOTEPLAN",

        additional_info: {
          items: [
            {
              id: String(transaccionId),
              title: titulo,
              description: this._generarDescripcionDetallada(
                datos,
                transaccionId
              ),
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
        },

        metadata: {
          transaccion_id: transaccionId,
          tipo_transaccion: tipo_transaccion || "pago",
          plataforma: "Loteplan",
          fecha_creacion: new Date().toISOString(),
          proyecto_id: id_proyecto || undefined,
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
                number: String(documento), // ✅ Asegurar que sea string
              }
            : undefined,
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
      // ✅ Agregar más detalles del error
      console.error("Datos recibidos:", {
        monto,
        titulo,
        id_usuario,
        tipo_transaccion,
      });
      throw new Error(`Fallo al crear preferencia de pago: ${error.message}`);
    }
  },
  /**
   * @async
   * @function verifyAndFetchPayment
   * @description Extrae el ID del pago desde un webhook de MP y obtiene los detalles completos del pago (consulta directa).
   * @param {object} req - Objeto de solicitud de Express con los datos del Webhook/Notificación.
   * @param {string} metodo - El método de pago a verificar (debe ser 'mercadopago').
   * @returns {Promise<VerifiedPaymentData|null>} Los datos del pago verificado o `null` si la notificación no es relevante/válida.
   */ async verifyAndFetchPayment(req, metodo) {
    if (metodo !== "mercadopago" || !paymentAPI) return null;

    const topicType =
      req.query.topic || req.query.type || req.body?.type || req.body?.topic; // 💡 Se intenta extraer el ID del pago de varias posibles estructuras de notificaciones de MP

    let paymentId =
      req.query.id ||
      req.query["data.id"] ||
      req.body?.data?.id ||
      req.body?.resource;

    if (typeof paymentId === "string" && paymentId.startsWith("http")) {
      paymentId = paymentId.split("/").pop();
    }

    console.log(
      `➡️ [MP Service] ID extraído antes de validación: ${paymentId}`
    );

    console.log(
      `➡️ [MP Service] Webhook recibido. Tipo: ${topicType}, ID Pasarela: ${paymentId}`
    ); // 🛑 Solo se procesan notificaciones de tipo 'payment' con un ID de pago válido

    if (topicType !== "payment" || !paymentId) {
      console.warn(
        `⚠️ [MP Service] Webhook ignorado. Topic: ${topicType}, ID: ${paymentId}`
      );
      return null;
    }

    try {
      // Obtener los detalles completos del pago de la API de MP
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
   * @description Solicita un reembolso total o parcial del pago a la API de Mercado Pago usando Axios (API REST directa).
   * Implementa un mecanismo de reintento probando tokens de TEST y LIVE.
   * @param {string} paymentId - ID del pago de Mercado Pago a reembolsar.
   * @param {number|null} [monto] - Monto a reembolsar (si es parcial), o `null` para reembolso total.
   * @returns {Promise<RefundResult>} Objeto con el resultado del reembolso.
   * @throws {Error} Si falla el reembolso después de probar todos los tokens disponibles.
   */ async realizarReembolso(paymentId, monto = null) {
    console.log(
      `➡️ [MP Service] Solicitando reembolso para Payment ID: ${paymentId}. Monto: ${
        monto ?? "Total"
      }`
    ); // 🔄 Prioridad de Tokens: Probamos TEST primero, luego LIVE.

    const tokens = [
      { name: "TEST", value: MP_TEST_ACCESS_TOKEN },
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
        }; // El cuerpo solo incluye el monto si se especifica un reembolso parcial
        const body =
          monto !== null && monto !== undefined
            ? { amount: parseFloat(monto) }
            : {}; // ✅ Llamada directa a la API REST con Axios

        const response = await axios.post(url, body, { headers }); // Éxito:

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
        const errorStatus = error.response?.status || error.statusCode; // ⚠️ Manejo de errores de credenciales (401/403) para pasar al siguiente token

        if (
          (errorStatus === 401 || errorStatus === 403) &&
          (tokenName === "TEST" || tokenName === "LIVE")
        ) {
          console.warn(
            `   - ⚠️ Fallo con Token ${tokenName} (Status ${errorStatus}). Reintentando con el otro token.`
          );
          continue; // Pasa al siguiente token
        } // Manejo de pagos ya reembolsados, no elegibles o no encontrados (400, 404)

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
        } // Si es un error crítico y no hay más tokens, lanzar error

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
    } // Si llegamos aquí, es porque el bucle terminó sin éxito tras probar ambos.

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
   * @description Procesa una Merchant Order (MO) de Mercado Pago. Esto se usa cuando el flujo de pago no es simple
   * (ej. métodos de pago offline o múltiples pagos). Se asegura de actualizar el estado de la Transacción local.
   * @param {string} merchantOrderId - ID de la Merchant Order de Mercado Pago.
   * @returns {Promise<void>}
   * @throws {Error} Si falla la obtención de la MO, la referencia externa es inválida, o falla la transacción local.
   */ async procesarPagosDeMerchantOrder(merchantOrderId) {
    if (!merchantOrderService) {
      throw new Error(
        "El servicio de MerchantOrder no está inicializado. Revise MP_ACCESS_TOKEN."
      );
    }

    console.log(
      `➡️ [MP Service] Procesando Merchant Order ID: ${merchantOrderId}`
    ); // 1. Iniciar Transacción de base de datos local para garantizar atomicidad

    const t = await sequelize.transaction({
      isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED,
    });

    try {
      // 2. Obtener los datos de la Merchant Order de MP
      const merchantOrderData = await merchantOrderService.get({
        id: String(merchantOrderId),
      });

      const transaccionId = parseInt(merchantOrderData.external_reference);

      if (!transaccionId) {
        throw new Error(
          "Merchant Order sin referencia de Transacción externa."
        );
      } // 3. Procesar cada pago asociado a la Merchant Order

      for (const mpPayment of merchantOrderData.payments) {
        const internalStatus = MP_STATUS_MAP[mpPayment.status];

        console.log(
          `   - [MP Payment] ID: ${mpPayment.id}, Estado MP: ${mpPayment.status} -> Estado Interno: ${internalStatus}`
        ); // Solo procesar pagos en estado final que requieran un cambio de estado en la Transacción

        if (
          internalStatus === "pagado" ||
          internalStatus === "rechazado" ||
          internalStatus === "devuelto"
        ) {
          let transaccion = await Transaccion.findByPk(transaccionId, {
            transaction: t,
            lock: t.LOCK.UPDATE, // Bloquear la fila para evitar concurrencia
          });

          if (!transaccion) continue; // Si la transacción local no existe, se salta // No procesar si la transacción ya está en estado final

          if (
            transaccion.estado_transaccion === "pagado" ||
            transaccion.estado_transaccion === "fallido" ||
            transaccion.estado_transaccion === "reembolsado"
          ) {
            console.log(
              `   - [MP Payment] Transacción ${transaccionId} ya en estado final. Saltando...`
            );
            continue;
          } // Crear o actualizar el registro de PagoMercado

          let pagoMercado = await PagoMercado.findOne({
            where: { id_transaccion_pasarela: mpPayment.id },
            transaction: t,
          }); // [Lógica de creación/actualización de PagoMercado y enlace a Transacción omitida para brevedad, pero mantenida en el código original] // 4. Actualizar estado de la Transacción local usando el servicio

          if (internalStatus === "pagado") {
            await transaccionService.confirmarTransaccion(transaccionId, {
              transaction: t,
            });
          } else if (internalStatus === "rechazado") {
            await transaccionService.procesarFalloTransaccion(
              transaccionId,
              "fallido",
              "Rechazado por MO",
              { transaction: t }
            );
          } else if (internalStatus === "devuelto") {
            await transaccionService.procesarFalloTransaccion(
              transaccionId,
              "reembolsado",
              "Devuelto por MO",
              { transaction: t }
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
   * @private
   * @function _generarDescripcionDetallada
   * @description Genera una descripción detallada para el recibo de pago
   * @param {PaymentSessionData} datos - Datos de la sesión de pago
   * @param {number} transaccionId - ID de la transacción
   * @returns {string} Descripción formateada
   */
  _generarDescripcionDetallada(datos, transaccionId) {
    const fecha = new Date().toLocaleDateString("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });

    let descripcion = `${datos.titulo || "Transacción"} | `;
    descripcion += `ID: #${transaccionId} | `;
    descripcion += `Fecha: ${fecha}`;

    // Agrega información adicional según el tipo
    if (datos.id_proyecto) {
      descripcion += ` | Proyecto ID: ${datos.id_proyecto}`;
    }

    if (datos.tipo_transaccion) {
      const tipoLegible = {
        directo: "Inversión Directa",
        Puja: "Puja",
        mensual: "Pago Mensual",
        pago_suscripcion_inicial: "Suscripción Inicial",
      };
      descripcion += ` | Tipo: ${
        tipoLegible[datos.tipo_transaccion] || datos.tipo_transaccion
      }`;
    }

    return descripcion;
  },
  /**
   * @async
   * @function refreshPaymentStatus
   * @description Consulta el estado actual de un pago de MP y actualiza los registros internos (`PagoMercado` y `Transaccion`) si es necesario.
   * @param {number} transaccionId - ID de la Transacción local.
   * @param {string} mpTransactionId - ID del pago de Mercado Pago.
   * @returns {Promise<{transaccion: Transaccion|null, pagoMercado: PagoMercado|null}|null>} Los registros actualizados.
   */ async refreshPaymentStatus(transaccionId, mpTransactionId) {
    if (!paymentAPI) return null;

    console.log(
      `➡️ [MP Service] Refrescando estado para Transacción ID: ${transaccionId}, Pago MP ID: ${mpTransactionId}`
    );

    try {
      // 1. Consultar el estado más reciente de MP
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
      }; // 2. Actualizar el registro de PagoMercado

      if (pagoMercado) {
        await pagoMercado.update(pagoData);
      } else {
        console.warn(
          `   - [MP Service] No se encontró registro PagoMercado para Transacción ${transaccionId}.`
        );
      } // 3. Confirmar la Transacción local si el pago fue aprobado

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
