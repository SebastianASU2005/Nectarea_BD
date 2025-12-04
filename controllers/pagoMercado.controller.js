const transaccionService = require("../services/transaccion.service");
const pagoMercadoService = require("../services/pagoMercado.service");
const Transaccion = require("../models/transaccion");
const PagoMercado = require("../models/pagoMercado");
const { sequelize } = require("../config/database");
const crypto = require("crypto");
const Inversion = require("../models/inversion");
const { Transaction } = require("sequelize");
const emailService = require("../services/email.service");
const usuarioService = require("../services/usuario.service");
const mensajeService = require("../services/mensaje.service");
const User = require("../models/usuario");

// Mapeo de estados de Mercado Pago (MP) a estados internos de la aplicación
const MP_STATUS_MAP = {
  approved: "aprobado",
  pending: "en_proceso",
  in_process: "en_proceso",
  rejected: "rechazado",
  cancelled: "rechazado",
  refunded: "devuelto",
  charged_back: "devuelto",
};
/**
 * 🔑 FUNCIÓN DE VALIDACIÓN CRÍTICA DE LA FIRMA (Mercado Pago Webhook)
 * VERSIÓN MEJORADA - Maneja correctamente payment y merchant_order
 * Utiliza la clave secreta (`MP_WEBHOOK_SECRET`), las cabeceras (`x-signature`, `x-request-id`)
 * y el ID de la data para verificar la autenticidad del webhook mediante HMAC-SHA256.
 * @param {object} req - Objeto de solicitud de Express.
 * @returns {boolean} True si la firma es válida, false en caso contrario.
 */
function verifySignature(req) {
  const secret = process.env.MP_WEBHOOK_SECRET?.trim();
  const signatureHeader = req.headers["x-signature"];
  const requestId = req.headers["x-request-id"];

  // ✅ EXTRAER TOPIC DE TODAS LAS FUENTES POSIBLES
  const topic =
    req.query.topic || req.body?.topic || req.query.type || req.body?.type;

  console.log("🔐 VALIDACIÓN DE FIRMA - DATOS COMPLETOS:", {
    signature: signatureHeader
      ? signatureHeader.substring(0, 50) + "..."
      : "MISSING",
    requestId: requestId || "MISSING",
    topic: topic || "MISSING",
    queryTopic: req.query.topic,
    queryType: req.query.type,
    bodyTopic: req.body?.topic,
    bodyType: req.body?.type,
    queryId: req.query.id,
    queryDataId: req.query["data.id"],
    bodyDataId: req.body?.data?.id,
    bodyResource: req.body?.resource,
    hasSecret: !!secret,
    secretPrefix: secret ? secret.substring(0, 10) + "..." : "MISSING",
  });

  if (!secret) {
    console.error("❌ CRÍTICO: MP_WEBHOOK_SECRET no configurado");
    return false;
  }

  // 🚫 IGNORAR formato antiguo de merchant_order que no se valida correctamente
  // MP envía el mismo evento con topic='topic_merchant_order_wh' que sí se valida bien
  if (topic === "merchant_order" && signatureHeader) {
    console.log(
      "⚠️ Webhook merchant_order (formato antiguo) IGNORADO - MP enviará topic_merchant_order_wh"
    );
    return true; // Aceptamos pero será ignorado en el handler
  }

  // ✅ CASO 1: Webhooks SIN firma (merchant_order legacy, algunos eventos antiguos)
  if (!signatureHeader) {
    // ✅ MERCHANT_ORDER: Algunos webhooks NO traen firma (comportamiento legacy)
    if (topic === "merchant_order" || topic === "order") {
      console.log(
        "⚠️ Webhook merchant_order sin firma ACEPTADO (comportamiento legacy de MP)"
      );
      return true;
    }

    // ✅ PAYMENT SIN FIRMA: Solo aceptar si tiene datos básicos válidos
    if (topic === "payment") {
      const hasBasicData = !!(
        req.query.id ||
        req.body?.data?.id ||
        req.query["data.id"]
      );

      if (hasBasicData) {
        console.warn(
          "⚠️ Payment webhook sin firma pero con datos válidos - ACEPTANDO (entorno legacy)"
        );
        return true;
      }
    }

    console.error(
      "❌ Webhook sin firma y sin tipo reconocido o datos válidos",
      {
        topic,
        hasQueryId: !!req.query.id,
        hasBodyDataId: !!req.body?.data?.id,
      }
    );
    return false;
  }

  // ✅ CASO 2: Webhooks CON firma
  if (!requestId) {
    console.error("❌ Falta x-request-id pero hay x-signature");
    return false;
  }

  // ✅ Extraer dataId usando la función auxiliar
  const dataId = extractDataId(req);

  if (!dataId) {
    console.error("❌ No se pudo extraer dataId para validar firma", {
      topic,
      queryId: req.query.id,
      bodyDataId: req.body?.data?.id,
      resource: req.body?.resource,
    });
    return false;
  }

  // Parsear ts y v1 de la firma
  const parts = signatureHeader.split(",");
  let ts, v1;

  for (const part of parts) {
    const [key, value] = part.split("=");
    if (key?.trim() === "ts") ts = value?.trim();
    if (key?.trim() === "v1") v1 = value?.trim();
  }

  if (!ts || !v1) {
    console.error("❌ No se pudo extraer ts o v1 de la firma", {
      signatureHeader: signatureHeader.substring(0, 100),
    });
    return false;
  }

  // 🔥 DIFERENCIA CLAVE: El manifest varía según el tipo de webhook
  let manifest;

  if (topic === "merchant_order" || topic === "order") {
    // Para merchant_order: solo se usa el ID del merchant_order
    manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  } else if (topic === "payment") {
    // Para payment: se usa el ID del payment
    manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  } else {
    // Para otros tipos, usar el formato estándar
    manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  }

  const localHash = crypto
    .createHmac("sha256", secret)
    .update(manifest)
    .digest("hex");

  const isValid = localHash === v1;

  if (isValid) {
    console.log("✅ Firma válida", {
      topic,
      dataId,
      requestId,
      ts,
      expected: localHash.substring(0, 20) + "...",
      received: v1.substring(0, 20) + "...",
    });
  } else {
    console.error("❌ Firma inválida", {
      topic,
      dataId,
      requestId,
      ts,
      manifest, // 🔍 Agregado para debugging
      expected: localHash.substring(0, 20) + "...",
      received: v1.substring(0, 20) + "...",
    });
  }

  return isValid;
}

/**
 * ✅ FUNCIÓN MEJORADA: Extrae el dataId de merchant_order o payment
 */
function extractDataId(req) {
  const topic =
    req.query.topic || req.body?.topic || req.query.type || req.body?.type;

  // 1. Intentar extraer de query params
  let dataId = req.query.id || req.query["data.id"];

  // 2. Intentar extraer del body
  if (!dataId) {
    dataId = req.body?.data?.id;
  }

  // 3. Para Merchant Orders, extraer del resource URL
  if (!dataId && (topic === "merchant_order" || topic === "order")) {
    const resource = req.body?.resource || req.query.resource;
    if (resource && typeof resource === "string") {
      // Puede venir como: "https://api.mercadolibre.com/merchant_orders/36032254645"
      const match = resource.match(/\/merchant_orders\/(\d+)/);
      if (match && match[1]) {
        dataId = match[1];
        console.log(
          `✅ DataId de merchant_order extraído de resource URL: ${dataId}`
        );
      }
    }
  }

  // 4. Para payments, limpiar si viene como URL
  if (dataId && typeof dataId === "string" && dataId.startsWith("http")) {
    dataId = dataId.split("/").pop();
    console.log(`✅ DataId limpiado de URL: ${dataId}`);
  }

  return dataId;
}

module.exports = { verifySignature, extractDataId };

const paymentController = {
  /**
   * @async
   * @function createCheckoutGenerico
   * @description Crea un nuevo checkout o regenera uno para una transacción existente.
   * Utiliza una transacción de base de datos para la atomicidad.
   * @param {object} req - Objeto de solicitud de Express (con datos de transacción en `body`).
   * @param {object} res - Objeto de respuesta de Express.
   */
  async createCheckoutGenerico(req, res) {
    const userId = req.user.id;
    const {
      id_transaccion,
      // ... otros datos necesarios para una transacción nueva
      metodo = "mercadopago",
    } = req.body;

    if (metodo !== "mercadopago") {
      return res.status(400).json({
        error: "Solo 'mercadopago' está soportado actualmente.",
      });
    }

    const t = await sequelize.transaction();
    try {
      let transaccion;
      let pagoMercado;
      let redirectUrl;

      if (id_transaccion) {
        // Flujo para Transacción Existente (Regenerar Checkout)
        transaccion = await Transaccion.findByPk(id_transaccion, {
          transaction: t,
        });

        if (!transaccion || transaccion.id_usuario !== userId) {
          throw new Error("Transacción no encontrada o no te pertenece.");
        }
        if (transaccion.estado_transaccion === "pagado") {
          throw new Error(`La transacción ${id_transaccion} ya está pagada.`);
        }

        ({ pagoMercado, redirectUrl } =
          await transaccionService.generarCheckoutParaTransaccionExistente(
            transaccion,
            metodo,
            { transaction: t }
          ));
      } else {
        // Flujo para Transacción Nueva
        const datosTransaccion = {
          // Extrae los campos relevantes para crear una Transacción
          tipo_transaccion: req.body.tipo_transaccion,
          monto: req.body.monto,
          id_usuario: userId,
          id_proyecto: req.body.id_proyecto,
          id_inversion: req.body.id_inversion,
          id_puja: req.body.id_puja,
          id_suscripcion: req.body.id_suscripcion,
        };

        ({ transaccion, pagoMercado, redirectUrl } =
          await transaccionService.crearTransaccionConCheckout(
            datosTransaccion,
            metodo,
            { transaction: t }
          ));
      }

      await t.commit();

      res.status(200).json({
        success: true,
        transaccionId: transaccion.id,
        pagoMercadoId: pagoMercado.id,
        tipo: transaccion.tipo_transaccion,
        monto: parseFloat(transaccion.monto),
        redirectUrl,
      });
    } catch (error) {
      await t.rollback();
      console.error("Error al crear/regenerar checkout:", error.message);
      res.status(500).json({
        error: error.message,
      });
    }
  },

  /**
   * @async
   * @function createCheckout
   * @description Endpoint simplificado para generar un checkout de pago para una **Inversión** pendiente.
   * Internamente llama a `createCheckoutGenerico`.
   * @param {object} req - Objeto de solicitud de Express (con `id_inversion` en `body`).
   * @param {object} res - Objeto de respuesta de Express.
   */
  async createCheckout(req, res) {
    const userId = req.user.id;
    const { id_inversion, metodo = "mercadopago" } = req.body;

    if (!id_inversion) {
      return res.status(400).json({ error: "id_inversion es requerido" });
    }

    // Buscar y validar la inversión pendiente del usuario
    const inversion = await Inversion.findOne({
      where: { id: id_inversion, id_usuario: userId, estado: "pendiente" },
    });

    if (!inversion) {
      return res.status(404).json({
        error: "Inversión no encontrada o ya fue pagada.",
      });
    }

    // Reconstruir el cuerpo de la solicitud para que lo procese el método genérico
    req.body = {
      tipo_transaccion: "directo",
      monto: parseFloat(inversion.monto),
      id_proyecto: inversion.id_proyecto,
      id_inversion: inversion.id,
      metodo,
    };

    return this.createCheckoutGenerico(req, res);
  },

  /**
   * @async
   * @function handleWebhook
   * @description 🔔 WEBHOOK CRÍTICO: Procesa las notificaciones de eventos de Mercado Pago.
   * Actualiza los estados de la Transacción y ejecuta la lógica de negocio si el pago es aprobado.
   * @param {object} req - Objeto de solicitud de Express (datos de MP en `query` y `body`).
   * @param {object} res - Objeto de respuesta de Express.
   */
  async handleWebhook(req, res) {
    // 🕐 IGNORAR WEBHOOKS MUY ANTIGUOS (más de 8 horas)
    const signatureHeader = req.headers["x-signature"];
    if (signatureHeader) {
      const tsMatch = signatureHeader.match(/ts=(\d+)/);
      if (tsMatch && tsMatch[1]) {
        const ts = parseInt(tsMatch[1]);
        const webhookAgeSeconds = Date.now() / 1000 - ts;
        const webhookAgeHours = webhookAgeSeconds / 3600;

        if (webhookAgeSeconds > 28800) {
          // 8 horas = 28800 segundos
          console.log(
            `⏱️ Webhook muy antiguo (${webhookAgeHours.toFixed(
              1
            )} horas). Ignorando para evitar procesamiento duplicado.`
          );
          return res.status(200).send("OK - Webhook antiguo ignorado");
        }
      }
    }

    // ⚠️ VALIDACIÓN CRÍTICA DE LA FIRMA
    const isValid = verifySignature(req);

    if (!isValid) {
      console.error("🚫 FIRMA INVÁLIDA - RECHAZANDO WEBHOOK");
      return res.status(401).send("Unauthorized");
    }

    console.log("✅ Firma válida - Procesando webhook");

    // ✅ EXTRAER TOPIC E ID AQUÍ (después de validar firma)
    const topic =
      req.query.topic || req.body?.topic || req.query.type || req.body?.type;
    const id = req.query.id || req.query["data.id"] || req.body?.data?.id;

    const { metodo } = req.params;
    let transaccionId = null; // Variable para rastrear la ID en caso de error

    // 🚨 DECLARACIÓN DE VARIABLES FUERA DEL TRY PARA ALCANCE EN EL BLOQUE CATCH
    let transaccion = null;
    let pagoMercado = null;

    // 🚫 IGNORAR el formato antiguo de merchant_order (MP envía duplicados)
    if (topic === "merchant_order") {
      console.log(
        `⚠️ Webhook merchant_order (formato antiguo) ignorado. ID: ${id}`
      );
      return res.status(200).send("OK - Formato antiguo ignorado");
    }

    // Flujo para `topic_merchant_order_wh` (formato nuevo)
    if (topic === "topic_merchant_order_wh" && id) {
      try {
        console.log(
          `🔄 Merchant Order ${id} recibida (formato nuevo). Buscando pagos asociados...`
        );
        await pagoMercadoService.procesarPagosDeMerchantOrder(id);
        console.log(
          `✅ Merchant Order ${id} procesada. Pagos internos actualizados.`
        );
        return res.status(200).send("OK - Merchant Order procesada");
      } catch (error) {
        console.error(
          `❌ Error al procesar Merchant Order ${id}: ${error.message}`
        );
        return res.status(200).send("OK - Error en procesamiento de MO");
      }
    }

    // Si no es merchant_order, se asume un flujo de `payment` individual
    const paymentResult = await pagoMercadoService.verifyAndFetchPayment(
      req,
      metodo
    );

    if (!paymentResult || !paymentResult.transaccionId) {
      console.log("Webhook: Sin datos de pago válidos o topic irrelevante.");
      return res.status(200).send("OK - Sin acción");
    }

    const {
      transaccionId: id_transaccion,
      status, // Estado de MP
      paymentDetails,
      transactionId, // ID de pago de la pasarela
      rawDetails,
    } = paymentResult;
    transaccionId = id_transaccion; // Asigna al rastreador de errores
    const internalStatus = MP_STATUS_MAP[status] || "en_proceso"; // Mapeo a estado interno

    // Iniciar transacción con nivel de aislamiento alto para evitar condiciones de carrera
    const t = await sequelize.transaction({
      isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED,
    });

    try {
      // 1. Bloquear la Transacción para evitar procesamiento múltiple
      transaccion = await Transaccion.findByPk(transaccionId, {
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      if (!transaccion) {
        await t.rollback();
        console.error(`Transacción ${transaccionId} no encontrada.`);
        return res.status(404).send("Transacción no encontrada");
      }

      if (transaccion.estado_transaccion === "pagado") {
        await t.commit();
        console.log(
          `Transacción ${transaccionId} ya procesada. Webhook ignorado.`
        );
        return res.status(200).send("OK - Ya procesado");
      }

      // 2. Actualizar/Crear registro de PagoMercado
      pagoMercado = await PagoMercado.findOne({
        where: { id_transaccion: transaccion.id },
        transaction: t,
      });

      const pagoData = {
        estado: internalStatus,
        id_transaccion_pasarela: transactionId,
        tipo_medio_pago: paymentDetails?.payment_method_type,
        fecha_aprobacion: paymentDetails?.date_approved,
        detalles_raw: rawDetails,
      };

      if (!pagoMercado) {
        // Si no existe, crea el registro y asócialo a la Transacción
        pagoMercado = await PagoMercado.create(
          {
            id_transaccion: transaccion.id,
            monto_pagado: transaccion.monto,
            metodo_pasarela: metodo,
            ...pagoData,
          },
          { transaction: t }
        );
        await transaccion.update(
          { id_pago_pasarela: pagoMercado.id },
          { transaction: t }
        );
      } else {
        // Si existe, solo actualiza
        await pagoMercado.update(pagoData, { transaction: t });
      }

      // 3. Ejecutar Lógica de Negocio según el Estado
      if (internalStatus === "aprobado") {
        console.log(
          `✅ Pago ${transactionId} APROBADO. Ejecutando lógica de negocio...`
        );
        // El servicio confirma la transacción y aplica la lógica de negocio (ej. crear Inversión, asignar tokens, etc.)
        await transaccionService.confirmarTransaccion(transaccion.id, {
          transaction: t,
        });
      } else if (
        internalStatus === "rechazado" ||
        internalStatus === "devuelto" ||
        internalStatus === "en_proceso"
      ) {
        // Procesar fallo/devolución/proceso
        const newStatus =
          internalStatus === "rechazado"
            ? "fallido"
            : internalStatus === "devuelto"
            ? "reembolsado"
            : "en_proceso";

        await transaccionService.procesarFalloTransaccion(
          transaccion.id,
          newStatus,
          `Pago ${internalStatus}: ${status}`,
          { transaction: t }
        );
      } else {
        // Actualizar el estado de la transacción con el estado interno mapeado
        await transaccion.update(
          { estado_transaccion: internalStatus },
          { transaction: t }
        );
      }

      await t.commit();
      console.log(
        `✅ Webhook procesado: Transacción ${transaccionId} (MP Estado: ${internalStatus})`
      );

      return res.status(200).send("OK");
    } catch (error) {
      // 🛑 LÓGICA DE REEMBOLSO AQUÍ: Se ejecuta ANTES del rollback.
      const errorMsg = error.message;

      // Lista de errores que requieren reembolso automático
      const requiereReembolso =
        errorMsg.includes("ya no tiene cupos disponibles") ||
        errorMsg.includes("capacidad máxima") ||
        errorMsg.includes("no está disponible") ||
        errorMsg.includes("ya alcanzó su objetivo de fondeo") ||
        errorMsg.includes("rechazado_por_capacidad") ||
        errorMsg.includes("rechazado_proyecto_cerrado") ||
        errorMsg.includes("expiró");

      if (requiereReembolso) {
        console.log(
          `💰 Iniciando flujo de reembolso automático para Transacción ${transaccionId} por error de negocio: ${errorMsg}`
        );

        try {
          // Las variables 'pagoMercado' y 'transaccion' son accesibles aquí
          if (
            pagoMercado &&
            pagoMercado.id_transaccion_pasarela &&
            transaccion &&
            transaccion.monto > 0
          ) {
            let reembolsoExitoso = false;
            let errorReembolso = null;

            // 1. Llamar al servicio de reembolso de Mercado Pago
            try {
              const resultadoReembolso =
                await pagoMercadoService.realizarReembolso(
                  pagoMercado.id_transaccion_pasarela,
                  parseFloat(transaccion.monto)
                );

              reembolsoExitoso = resultadoReembolso?.success === true;

              if (reembolsoExitoso) {
                console.log(
                  `✅ Reembolso de MP solicitado exitosamente para ${pagoMercado.id_transaccion_pasarela}.`
                );
              } else {
                errorReembolso =
                  resultadoReembolso?.message || "Reembolso falló sin detalles";
                console.warn(
                  `⚠️ Fallo en el reembolso de MP: ${errorReembolso}`
                );
              }
            } catch (refundError) {
              errorReembolso = refundError.message;
              console.error(`❌ ERROR CRÍTICO DE REEMBOLSO: ${errorReembolso}`);
            }

            // 2. Notificación a Usuario y Administradores 🚨
            const user = await User.findByPk(transaccion.id_usuario);

            if (user) {
              // 2a. Email al usuario (SIEMPRE se notifica, éxito o fallo del reembolso)
              try {
                await emailService.notificarReembolsoUsuario(
                  user,
                  transaccion,
                  errorMsg, // Razón del fallo de negocio
                  reembolsoExitoso // <--- NUEVO ARGUMENTO
                );
              } catch (e) {
                console.error(`Error al enviar email al usuario: ${e.message}`);
              }

              // 2b. Email a TODOS los administradores (siempre, éxito o fallo)
              try {
                const admins = await usuarioService.findAllAdmins();

                for (const admin of admins) {
                  if (admin.email) {
                    try {
                      await emailService.notificarReembolsoAdminMejorada(
                        admin.email,
                        user,
                        transaccion,
                        errorMsg,
                        {
                          reembolsoExitoso,
                          errorReembolso,
                          idPagoMP: pagoMercado.id_transaccion_pasarela,
                        }
                      );
                    } catch (e) {
                      console.error(
                        `Error al enviar email de reembolso al admin ${admin.id}: ${e.message}`
                      );
                    }
                  }
                }
              } catch (adminError) {
                console.error(
                  `Error al notificar a administradores: ${adminError.message}`
                );
              }
            } else {
              console.error(
                `Error: Usuario ${transaccion.id_usuario} no encontrado para notificar reembolso.`
              );
            }
          } else {
            console.warn(
              `⚠️ NO se pudo realizar el reembolso automático para Transacción ${transaccionId}. Faltan datos de pago de MP.`
            );
          }
        } catch (reembolsoError) {
          console.error(
            `❌ ERROR GENERAL EN FLUJO DE REEMBOLSO:`,
            reembolsoError.message
          );
        }
      }

      // El ROLLBACK debe hacerse siempre si hubo un error en la lógica de negocio.
      await t.rollback();
      console.error(
        `❌ Error CRÍTICO en webhook (Transacción ${transaccionId}):`,
        errorMsg
      );

      // Marcar como fallido fuera de la transacción
      if (transaccionId) {
        try {
          const detalleError = requiereReembolso
            ? `Error fatal en webhook (ROLLBACK + REEMBOLSO SOLICITADO): ${errorMsg}`
            : `Error fatal en webhook (ROLLBACK): ${errorMsg}`;

          await Transaccion.update(
            {
              estado_transaccion: "fallido",
              error_detalle: detalleError,
            },
            { where: { id: transaccionId } }
          );
        } catch (updateError) {
          console.error(
            "ERROR GRAVE al marcar como fallido:",
            updateError.message
          );
        }
      }

      return res.status(500).send("Error interno");
    }
  },
  /**
   * @async
   * @function iniciarPagoPorModelo
   * @description ✨ Endpoint genérico que inicia una transacción y checkout para cualquier modelo
   * (`inversion`, `puja`, `suscripcion`) usando sus IDs.
   * @param {object} req - Objeto de solicitud de Express (con `modelo` y `modeloId` en `params`).
   * @param {object} res - Objeto de respuesta de Express.
   */
  async iniciarPagoPorModelo(req, res) {
    try {
      const { modelo, modeloId } = req.params;
      const userId = req.user.id;

      const idNumerico = parseInt(modeloId);

      if (!modelo || isNaN(idNumerico) || idNumerico <= 0) {
        return res.status(400).json({
          error:
            "Ruta de pago inválida. Se requiere /:modelo/:modeloId, donde :modeloId es un número válido.",
        });
      }

      // Delega la lógica de negocio al servicio para encontrar el modelo, validar, crear Transacción y Checkout
      const { transaccion, redirectUrl } =
        await transaccionService.iniciarTransaccionYCheckout(
          modelo,
          idNumerico,
          userId
        );

      res.status(200).json({
        success: true,
        message: `Transacción #${transaccion.id} creada. Redireccionando a la pasarela de pago.`,
        transaccionId: transaccion.id,
        modelo: modelo,
        modeloId: idNumerico,
        redirectUrl: redirectUrl,
      });
    } catch (error) {
      console.error(
        `Error en el checkout genérico para ${req.params.modelo}:`,
        error.message
      );
      res.status(400).json({
        error: error.message,
      });
    }
  },

  /**
   * @async
   * @function handleCheckoutRedirect
   * @description ↩️ REDIRECCIÓN: Maneja la respuesta GET del usuario desde la pasarela de pago.
   * Solo redirige al frontend con el estado, pero realiza una actualización preliminar si hay cancelación.
   * @param {object} req - Objeto de solicitud de Express (con parámetros de estado en `query`).
   * @param {object} res - Objeto de respuesta de Express.
   */
  async handleCheckoutRedirect(req, res) {
    const { id_transaccion, collection_status, status } = req.query;
    if (!id_transaccion) {
      return res
        .status(400)
        .send("ID de Transacción requerido para la redirección.");
    }
    try {
      // Usamos `collection_status` o `status` para verificar si el usuario canceló
      const finalStatus = collection_status || status;
      if (
        finalStatus === "rejected" ||
        finalStatus === "cancelled" ||
        finalStatus === "failure"
      ) {
        console.log(
          `Usuario canceló o pago rechazado para Transacción ${id_transaccion}. Marcando como fallido.`
        );
        // Marca la transacción como fallida, pero la lógica crítica de pago la maneja el webhook.
        await transaccionService.cancelarTransaccionPorUsuario(id_transaccion);
        return res.redirect(
          `${process.env.FRONTEND_URL}/pago-fallido?transaccion=${id_transaccion}`
        );
      }

      // Si no es fallo/cancelación, redirige al frontend para mostrar el estado final (que se obtiene con `getPaymentStatus`)
      return res.redirect(
        `${process.env.FRONTEND_URL}/pago-estado?transaccion=${id_transaccion}`
      );
    } catch (error) {
      console.error("Error en la redirección de checkout:", error.message);
      return res.redirect(
        `${process.env.FRONTEND_URL}/error-fatal?transaccion=${id_transaccion}`
      );
    }
  },

  /**
   * @async
   * @function getPaymentStatus
   * @description Obtiene el estado actual de una transacción y opcionalmente fuerza una actualización
   * de estado consultando directamente a la pasarela de pago.
   * @param {object} req - Objeto de solicitud de Express (con `id_transaccion` en `params` y `refresh` en `query`).
   * @param {object} res - Objeto de respuesta de Express.
   */
  async getPaymentStatus(req, res) {
    try {
      const { id_transaccion } = req.params;
      const { refresh } = req.query;
      const userId = req.user.id;

      // 1. Buscar la transacción y verificar propiedad
      let transaccion = await Transaccion.findOne({
        where: { id: id_transaccion, id_usuario: userId },
      });

      if (!transaccion) {
        return res.status(404).json({
          error: "Transacción no encontrada o no te pertenece.",
        });
      }

      let statusFinal = ["pagado", "fallido", "reembolsado"];
      const needsRefresh =
        refresh === "true" &&
        !statusFinal.includes(transaccion.estado_transaccion);

      // Buscar el registro de pago más reciente
      let pagoMercado = await PagoMercado.findOne({
        where: { id_transaccion: transaccion.id },
        order: [["createdAt", "DESC"]],
      });

      // 2. Forzar actualización de estado si se solicita y es necesario
      if (needsRefresh && pagoMercado?.id_transaccion_pasarela) {
        console.log(
          `Forzando actualización de estado de MP para transacción ${id_transaccion}`
        );

        // El servicio consulta a la API de MP y actualiza DB si el estado ha cambiado
        const updatedData = await pagoMercadoService.refreshPaymentStatus(
          transaccion.id,
          pagoMercado.id_transaccion_pasarela
        );

        if (updatedData) {
          // Si hubo actualización, usamos los nuevos objetos
          transaccion = updatedData.transaccion;
          pagoMercado = updatedData.pagoMercado;
        }
      }

      // 3. Formatear la respuesta
      const pagoDetalle = pagoMercado
        ? {
            id: pagoMercado.id,
            transaccionIdPasarela: pagoMercado.id_transaccion_pasarela,
            monto: parseFloat(pagoMercado.monto_pagado),
            estado: pagoMercado.estado,
            metodo: pagoMercado.tipo_medio_pago,
            fecha: pagoMercado.fecha_aprobacion || pagoMercado.createdAt,
          }
        : null;

      res.status(200).json({
        transaccion: {
          id: transaccion.id,
          tipo: transaccion.tipo_transaccion,
          monto: parseFloat(transaccion.monto),
          estado: transaccion.estado_transaccion,
          fecha: transaccion.fecha_transaccion,
          id_inversion: transaccion.id_inversion,
          id_puja: transaccion.id_puja,
          id_suscripcion: transaccion.id_suscripcion,
          id_proyecto: transaccion.id_proyecto,
        },
        pagoPasarela: pagoDetalle,
      });
    } catch (error) {
      console.error("Error al consultar estado de pago:", error.message);
      res.status(500).json({ error: error.message });
    }
  },
};

module.exports = paymentController;
