// Archivo: controllers/pagoMercado.controller.js
// VERSIÓN COMPLETA CON MANEJO DE PAGOS DUPLICADOS

const transaccionService = require("../services/transaccion.service");
const pagoMercadoService = require("../services/pagoMercado.service");
const Transaccion = require("../models/transaccion");
const PagoMercado = require("../models/pagoMercado");
const { sequelize } = require("../config/database");
const crypto = require("crypto");
const Inversion = require("../models/inversion");
const { Transaction, Op } = require("sequelize");
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

  if (!secret) {
    console.error("❌ CRÍTICO: MP_WEBHOOK_SECRET no configurado");
    return false;
  }

  // Si no hay firma, rechazar (por seguridad)
  if (!signatureHeader) {
    console.warn("⚠️ Webhook sin firma - rechazado");
    return false;
  }

  // Extraer ts y v1 de la firma
  const parts = signatureHeader.split(",");
  let ts = null,
    v1 = null;
  for (const part of parts) {
    const [key, value] = part.split("=");
    if (key?.trim() === "ts") ts = value?.trim();
    if (key?.trim() === "v1") v1 = value?.trim();
  }
  if (!ts || !v1) {
    console.warn("⚠️ Firma sin ts o v1", { signatureHeader });
    return false;
  }

  // Obtener posibles IDs del pago (data.id)
  const candidateIds = [
    req.body?.data?.id,
    req.query.id,
    req.query["data.id"],
    req.body?.id, // a veces viene directamente
  ].filter(Boolean);

  if (candidateIds.length === 0) {
    console.warn("⚠️ No se encontró ID de pago en el webhook");
    return false;
  }

  // Función helper para calcular hash
  const computeHash = (manifest) => {
    return crypto.createHmac("sha256", secret).update(manifest).digest("hex");
  };

  // Probar cada candidateId
  for (const candidateId of candidateIds) {
    // Intento 1: con request-id (si existe)
    if (requestId) {
      const manifest = `id:${candidateId};request-id:${requestId};ts:${ts};`;
      if (computeHash(manifest) === v1) {
        console.log(
          `✅ Firma válida (con request-id) para pago ${candidateId}`,
        );
        return true;
      }
    }
    // Intento 2: sin request-id (MP a veces no lo envía)
    const manifestNoReq = `id:${candidateId};ts:${ts};`;
    if (computeHash(manifestNoReq) === v1) {
      console.log(`✅ Firma válida (sin request-id) para pago ${candidateId}`);
      return true;
    }
  }

  console.error("❌ Firma inválida para todos los candidatos", {
    candidateIds,
    ts,
    v1,
    requestId,
  });
  return false;
}

/**
 * ✅ FUNCIÓN MEJORADA: Extrae el dataId de merchant_order o payment
 */
function extractDataId(req) {
  const topic =
    req.query.topic || req.body?.topic || req.query.type || req.body?.type;

  let dataId = req.query.id || req.query["data.id"];

  if (!dataId) {
    dataId = req.body?.data?.id;
  }

  if (!dataId && (topic === "merchant_order" || topic === "order")) {
    const resource = req.body?.resource || req.query.resource;
    if (resource && typeof resource === "string") {
      const match = resource.match(/\/merchant_orders\/(\d+)/);
      if (match && match[1]) {
        dataId = match[1];
        console.log(
          `✅ DataId de merchant_order extraído de resource URL: ${dataId}`,
        );
      }
    }
  }

  if (dataId && typeof dataId === "string" && dataId.startsWith("http")) {
    dataId = dataId.split("/").pop();
    console.log(`✅ DataId limpiado de URL: ${dataId}`);
  }

  return dataId;
}

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
    const { id_transaccion, metodo = "mercadopago" } = req.body;

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
            { transaction: t },
          ));
      } else {
        const datosTransaccion = {
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
            { transaction: t },
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

    const inversion = await Inversion.findOne({
      where: { id: id_inversion, id_usuario: userId, estado: "pendiente" },
    });

    if (!inversion) {
      return res.status(404).json({
        error: "Inversión no encontrada o ya fue pagada.",
      });
    }

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
   * INCLUYE MANEJO DE PAGOS DUPLICADOS.
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
          console.log(
            `⏱️ Webhook muy antiguo (${webhookAgeHours.toFixed(1)} horas). Ignorando.`,
          );
          return res.status(200).send("OK - Webhook antiguo ignorado");
        }
      }
    }

    const isValid = verifySignature(req);
    if (!isValid) {
      console.error("🚫 FIRMA INVÁLIDA - RECHAZANDO WEBHOOK");
      return res.status(401).send("Unauthorized");
    }

    console.log("✅ Firma válida - Procesando webhook");

    const topic =
      req.query.topic || req.body?.topic || req.query.type || req.body?.type;
    const id = req.query.id || req.query["data.id"] || req.body?.data?.id;
    const { metodo } = req.params;
    let transaccionId = null;
    let transaccion = null;
    let pagoMercado = null;

    if (topic === "merchant_order") {
      console.log(
        `⚠️ Webhook merchant_order (formato antiguo) ignorado. ID: ${id}`,
      );
      return res.status(200).send("OK - Formato antiguo ignorado");
    }

    if (topic === "topic_merchant_order_wh" && id) {
      try {
        console.log(`🔄 Merchant Order ${id} recibida. Procesando...`);
        await pagoMercadoService.procesarPagosDeMerchantOrder(id);
        console.log(`✅ Merchant Order ${id} procesada.`);
        return res.status(200).send("OK - Merchant Order procesada");
      } catch (error) {
        console.error(
          `❌ Error al procesar Merchant Order ${id}: ${error.message}`,
        );
        return res.status(200).send("OK - Error en procesamiento de MO");
      }
    }

    const paymentResult = await pagoMercadoService.verifyAndFetchPayment(
      req,
      metodo,
    );

    if (!paymentResult || !paymentResult.transaccionId) {
      console.log("Webhook: Sin datos de pago válidos o topic irrelevante.");
      return res.status(200).send("OK - Sin acción");
    }

    const {
      transaccionId: id_transaccion,
      status,
      paymentDetails,
      transactionId,
      rawDetails,
    } = paymentResult;
    transaccionId = id_transaccion;
    const internalStatus = MP_STATUS_MAP[status] || "en_proceso";

    const t = await sequelize.transaction({
      isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED,
    });

    try {
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
        // Verificar si este webhook corresponde a un pago duplicado para la misma entidad
        const duplicado = await paymentController.verificarDuplicadoPorEntidad(transaccion);

        if (duplicado) {
          console.log(
            `⚠️ Webhook duplicado detectado para la misma entidad (${duplicado.tipo}). Se intentará reembolsar este pago.`,
          );
          await t.rollback(); // No necesitamos la transacción actual porque la original ya está pagada

          // Obtener el pago de Mercado Pago asociado a este webhook (ya lo tenemos en paymentResult)
          const pagoMercadoDuplicado = await PagoMercado.findOne({
            where: { id_transaccion_pasarela: transactionId },
          });

          if (
            pagoMercadoDuplicado &&
            pagoMercadoDuplicado.id_transaccion_pasarela
          ) {
            let reembolsoExitoso = false;
            let errorReembolso = null;
            try {
              const resultado = await pagoMercadoService.realizarReembolso(
                pagoMercadoDuplicado.id_transaccion_pasarela,
                parseFloat(transaccion.monto),
              );
              reembolsoExitoso = resultado?.success === true;
              if (!reembolsoExitoso && resultado?.alreadyRefunded) {
                errorReembolso = "El pago ya estaba reembolsado";
              } else if (!reembolsoExitoso) {
                errorReembolso = resultado?.message || "Reembolso falló";
              }
            } catch (err) {
              errorReembolso = err.message;
              console.error(`Error en reembolso duplicado: ${errorReembolso}`);
            }

            // Notificar al usuario y admins
            const user = await User.findByPk(transaccion.id_usuario);
            if (user) {
              await emailService.notificarReembolsoUsuario(
                user,
                transaccion,
                `Pago duplicado para la misma ${duplicado.tipo}. El sistema intentó reembolsar automáticamente.`,
                reembolsoExitoso,
              );

              const admins = await usuarioService.findAllAdmins();
              for (const admin of admins) {
                if (admin.email) {
                  await emailService.notificarReembolsoAdminMejorada(
                    admin.email,
                    user,
                    transaccion,
                    `PAGO DUPLICADO (misma entidad ${duplicado.tipo})`,
                    {
                      reembolsoExitoso,
                      errorReembolso,
                      idPagoMP: pagoMercadoDuplicado.id_transaccion_pasarela,
                    },
                  );
                }
              }
            }
          } else {
            // 🛡️ ROBUSTEZ: No se encontró el registro PagoMercado, notificar a administradores manualmente
            console.warn(
              `⚠️ No se encontró registro de PagoMercado para el webhook duplicado (paymentId: ${transactionId}). Se requiere revisión manual.`,
            );

            try {
              const user = await User.findByPk(transaccion.id_usuario);
              const admins = await usuarioService.findAllAdmins();
              for (const admin of admins) {
                if (admin.email) {
                  await emailService.sendEmail(
                    admin.email,
                    `🚨 PAGO DUPLICADO SIN REGISTRO LOCAL - Payment ID ${transactionId}`,
                    `Se recibió un webhook de pago duplicado para la transacción ${transaccion.id} (entidad ${duplicado.tipo}), pero no se encontró el registro PagoMercado asociado.\n\nNo se pudo reembolsar automáticamente. Revisión manual requerida.\n\nUsuario afectado: ${user?.email || transaccion.id_usuario}\nMonto: ${transaccion.monto}`,
                    `<p>Se requiere <strong>revisión manual</strong> para el pago duplicado:</p>
               <ul>
                 <li><strong>Payment ID MP:</strong> ${transactionId}</li>
                 <li><strong>Transacción local:</strong> ${transaccion.id}</li>
                 <li><strong>Entidad duplicada:</strong> ${duplicado.tipo}</li>
                 <li><strong>Usuario:</strong> ${user?.email || transaccion.id_usuario}</li>
                 <li><strong>Monto:</strong> $${transaccion.monto}</li>
               </ul>
               <p>Este pago debe ser reembolsado manualmente desde el panel de Mercado Pago.</p>`,
                  );
                }
              }
            } catch (notifyErr) {
              console.error(
                "Error notificando a admins sobre duplicado sin PagoMercado:",
                notifyErr.message,
              );
            }
          }

          return res
            .status(200)
            .send("OK - Duplicado procesado (reembolso intentado)");
        }

        // Si no es duplicado, simplemente ignorar
        await t.commit();
        console.log(
          `Transacción ${transaccionId} ya procesada. Webhook ignorado.`,
        );
        return res.status(200).send("OK - Ya procesado");
      }

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
        pagoMercado = await PagoMercado.create(
          {
            id_transaccion: transaccion.id,
            monto_pagado: transaccion.monto,
            metodo_pasarela: metodo,
            ...pagoData,
          },
          { transaction: t },
        );
        await transaccion.update(
          { id_pago_pasarela: pagoMercado.id },
          { transaction: t },
        );
      } else {
        await pagoMercado.update(pagoData, { transaction: t });
      }

      if (internalStatus === "aprobado") {
        console.log(
          `✅ Pago ${transactionId} APROBADO. Ejecutando lógica de negocio...`,
        );
        await transaccionService.confirmarTransaccion(transaccion.id, {
          transaction: t,
        });
      } else if (
        internalStatus === "rechazado" ||
        internalStatus === "devuelto" ||
        internalStatus === "en_proceso"
      ) {
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
          { transaction: t },
        );
      } else {
        await transaccion.update(
          { estado_transaccion: internalStatus },
          { transaction: t },
        );
      }

      await t.commit();
      console.log(
        `✅ Webhook procesado: Transacción ${transaccionId} (MP Estado: ${internalStatus})`,
      );
      return res.status(200).send("OK");
    } catch (error) {
      const errorMsg = error.message;

      const esErrorDuplicado =
        errorMsg.includes("ya tiene una transacción pagada") ||
        errorMsg.includes("ya está marcada como") ||
        errorMsg.includes("segundo pago") ||
        errorMsg.includes("No se puede procesar un segundo pago");

      const requiereReembolso =
        !esErrorDuplicado &&
        (errorMsg.includes("ya no tiene cupos disponibles") ||
          errorMsg.includes("capacidad máxima") ||
          errorMsg.includes("no está disponible") ||
          errorMsg.includes("ya alcanzó su objetivo de fondeo") ||
          errorMsg.includes("rechazado_por_capacidad") ||
          errorMsg.includes("rechazado_proyecto_cerrado") ||
          errorMsg.includes("expiró"));

      // ─────────────────────────────────────────────────────────────────
      // CASO 1: PAGO DUPLICADO — reembolso automático + notificaciones
      // ─────────────────────────────────────────────────────────────────
      if (esErrorDuplicado) {
        console.warn(`⚠️ WEBHOOK DUPLICADO DETECTADO: ${errorMsg}`);
        console.warn(
          `   Transacción ID: ${transaccionId}, Pago MP ID: ${transactionId}`,
        );

        await t.rollback();

        // Marcar la transacción duplicada como fallida
        if (transaccionId) {
          try {
            await Transaccion.update(
              {
                estado_transaccion: "fallido",
                error_detalle: `Pago duplicado rechazado: ${errorMsg}`,
              },
              { where: { id: transaccionId } },
            );
          } catch (updateError) {
            console.error(
              "Error al marcar transacción duplicada como fallida:",
              updateError.message,
            );
          }
        }

        // Intentar reembolso automático si tenemos los datos necesarios
        if (
          pagoMercado &&
          pagoMercado.id_transaccion_pasarela &&
          transaccion &&
          parseFloat(transaccion.monto) > 0
        ) {
          let reembolsoExitoso = false;
          let errorReembolso = null;

          try {
            const resultadoReembolso =
              await pagoMercadoService.realizarReembolso(
                pagoMercado.id_transaccion_pasarela,
                parseFloat(transaccion.monto),
              );
            reembolsoExitoso = resultadoReembolso?.success === true;

            if (reembolsoExitoso) {
              console.log(
                `✅ Reembolso automático procesado para pago duplicado ${pagoMercado.id_transaccion_pasarela}`,
              );
            } else {
              errorReembolso =
                resultadoReembolso?.message || "Reembolso falló sin detalles";
              console.warn(
                `⚠️ Fallo en reembolso de duplicado: ${errorReembolso}`,
              );
            }
          } catch (refundError) {
            errorReembolso = refundError.message;
            console.error(
              `❌ Error crítico al reembolsar duplicado: ${errorReembolso}`,
            );
          }

          // Notificar al usuario
          const user = await User.findByPk(transaccion.id_usuario).catch(
            () => null,
          );
          if (user) {
            try {
              await emailService.notificarReembolsoUsuario(
                user,
                transaccion,
                "Cobro duplicado detectado: ya existe un pago confirmado para esta operación.",
                reembolsoExitoso,
              );
            } catch (e) {
              console.error(
                `Error al notificar usuario por duplicado: ${e.message}`,
              );
            }

            // Notificar a administradores
            try {
              const admins = await usuarioService.findAllAdmins();
              for (const admin of admins) {
                if (!admin.email) continue;
                await emailService
                  .notificarReembolsoAdminMejorada(
                    admin.email,
                    user,
                    transaccion,
                    `PAGO DUPLICADO: ${errorMsg}`,
                    {
                      reembolsoExitoso,
                      errorReembolso,
                      idPagoMP: pagoMercado.id_transaccion_pasarela,
                    },
                  )
                  .catch((e) =>
                    console.error(
                      `Error al notificar admin ${admin.id}: ${e.message}`,
                    ),
                  );
              }
            } catch (e) {
              console.error(
                `Error al obtener admins para notificar duplicado: ${e.message}`,
              );
            }
          }
        } else {
          // Sin datos suficientes para reembolsar — avisar a admins igual
          console.warn(
            `⚠️ Pago duplicado sin datos suficientes para reembolso. Transacción: ${transaccionId}`,
          );
          try {
            const admins = await usuarioService.findAllAdmins();
            for (const admin of admins) {
              if (!admin.email) continue;
              await emailService
                .sendEmail(
                  admin.email,
                  `🚨 PAGO DUPLICADO SIN REEMBOLSO AUTOMÁTICO - Transacción #${transaccionId}`,
                  `Pago duplicado detectado para transacción #${transaccionId}. No se pudo reembolsar automáticamente. Revisión manual requerida. Error: ${errorMsg}`,
                  `<p>Se detectó un <strong>pago duplicado</strong> para la Transacción <strong>#${transaccionId}</strong>.</p>
                   <p>No fue posible procesar el reembolso automático por falta de datos del pago en pasarela.</p>
                   <p><strong>Revisión manual requerida.</strong></p>
                   <p><strong>Error:</strong> ${errorMsg}</p>`,
                )
                .catch((e) =>
                  console.error(
                    `Error al notificar admin sin datos: ${e.message}`,
                  ),
                );
            }
          } catch (e) {
            console.error(
              `Error buscando admins para duplicado sin datos: ${e.message}`,
            );
          }
        }

        return res
          .status(200)
          .send("OK - Pago duplicado rechazado y reembolso procesado");
      }

      // ─────────────────────────────────────────────────────────────────
      // CASO 2: ERROR QUE REQUIERE REEMBOLSO (capacidad, proyecto cerrado…)
      // ─────────────────────────────────────────────────────────────────
      if (requiereReembolso) {
        console.log(
          `💰 Iniciando flujo de reembolso automático para Transacción ${transaccionId} por: ${errorMsg}`,
        );

        try {
          if (
            pagoMercado &&
            pagoMercado.id_transaccion_pasarela &&
            transaccion &&
            transaccion.monto > 0
          ) {
            let reembolsoExitoso = false;
            let errorReembolso = null;

            try {
              const resultadoReembolso =
                await pagoMercadoService.realizarReembolso(
                  pagoMercado.id_transaccion_pasarela,
                  parseFloat(transaccion.monto),
                );
              reembolsoExitoso = resultadoReembolso?.success === true;

              if (reembolsoExitoso) {
                console.log(
                  `✅ Reembolso de MP solicitado exitosamente para ${pagoMercado.id_transaccion_pasarela}.`,
                );
              } else {
                errorReembolso =
                  resultadoReembolso?.message || "Reembolso falló sin detalles";
                console.warn(
                  `⚠️ Fallo en el reembolso de MP: ${errorReembolso}`,
                );
              }
            } catch (refundError) {
              errorReembolso = refundError.message;
              console.error(`❌ ERROR CRÍTICO DE REEMBOLSO: ${errorReembolso}`);
            }

            const user = await User.findByPk(transaccion.id_usuario);
            if (user) {
              try {
                await emailService.notificarReembolsoUsuario(
                  user,
                  transaccion,
                  errorMsg,
                  reembolsoExitoso,
                );
              } catch (e) {
                console.error(`Error al enviar email al usuario: ${e.message}`);
              }

              try {
                const admins = await usuarioService.findAllAdmins();
                for (const admin of admins) {
                  if (!admin.email) continue;
                  await emailService
                    .notificarReembolsoAdminMejorada(
                      admin.email,
                      user,
                      transaccion,
                      errorMsg,
                      {
                        reembolsoExitoso,
                        errorReembolso,
                        idPagoMP: pagoMercado.id_transaccion_pasarela,
                      },
                    )
                    .catch((e) =>
                      console.error(
                        `Error al enviar email al admin ${admin.id}: ${e.message}`,
                      ),
                    );
                }
              } catch (adminError) {
                console.error(
                  `Error al notificar a administradores: ${adminError.message}`,
                );
              }
            } else {
              console.error(
                `Usuario ${transaccion.id_usuario} no encontrado para notificar reembolso.`,
              );
            }
          } else {
            console.warn(
              `⚠️ NO se pudo realizar el reembolso automático para Transacción ${transaccionId}. Faltan datos de pago de MP.`,
            );
          }
        } catch (reembolsoError) {
          console.error(
            `❌ ERROR GENERAL EN FLUJO DE REEMBOLSO:`,
            reembolsoError.message,
          );
        }
      }

      // ─────────────────────────────────────────────────────────────────
      // CASO 3: CUALQUIER OTRO ERROR — rollback + marcar como fallido
      // ─────────────────────────────────────────────────────────────────
      await t.rollback();
      console.error(
        `❌ Error CRÍTICO en webhook (Transacción ${transaccionId}):`,
        errorMsg,
      );

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
            { where: { id: transaccionId } },
          );
        } catch (updateError) {
          console.error(
            "ERROR GRAVE al marcar como fallido:",
            updateError.message,
          );
        }
      }

      return res.status(200).send("OK - Error procesado");
    }
  },
  async verificarDuplicadoPorEntidad(transaccion) {
    const {
      tipo_transaccion,
      id_inversion,
      id_puja,
      id_pago_mensual,
      id_pago_adhesion,
      id,
    } = transaccion;

    let whereCondition = null;
    let tipoEntidad = "";

    switch (tipo_transaccion) {
      case "directo":
        if (!id_inversion) return null;
        whereCondition = { id_inversion, tipo_transaccion: "directo" };
        tipoEntidad = "inversión";
        break;
      case "Puja":
        if (!id_puja) return null;
        whereCondition = { id_puja, tipo_transaccion: "Puja" };
        tipoEntidad = "puja";
        break;
      case "mensual":
        if (!id_pago_mensual) return null;
        whereCondition = { id_pago_mensual };
        tipoEntidad = "pago mensual";
        break;
      case "adhesion":
        if (!id_pago_adhesion) return null;
        whereCondition = { id_pago_adhesion };
        tipoEntidad = "pago de adhesión";
        break;
      default:
        return null;
    }

    const otraTransaccion = await Transaccion.findOne({
      where: {
        ...whereCondition,
        id: { [Op.ne]: id },
        estado_transaccion: "pagado",
      },
    });

    if (otraTransaccion) {
      console.log(
        `🔍 Duplicado detectado: la ${tipoEntidad} ya tiene transacción pagada ID ${otraTransaccion.id} (actual: ${id})`,
      );
      return { tipo: tipoEntidad, id: otraTransaccion.id };
    }
    return null;
  },
  /**
   * @async
   * @function iniciarPagoPorModelo
   * @description ✨ Endpoint genérico que inicia una transacción y checkout para cualquier modelo
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

      const { transaccion, redirectUrl } =
        await transaccionService.iniciarTransaccionYCheckout(
          modelo,
          idNumerico,
          userId,
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
        error.message,
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
      const finalStatus = collection_status || status;
      if (
        finalStatus === "rejected" ||
        finalStatus === "cancelled" ||
        finalStatus === "failure"
      ) {
        console.log(
          `Usuario canceló o pago rechazado para Transacción ${id_transaccion}.`,
        );
        await transaccionService.cancelarTransaccionPorUsuario(id_transaccion);
        return res.redirect(
          `${process.env.FRONTEND_URL}/pago-fallido?transaccion=${id_transaccion}`,
        );
      }

      return res.redirect(
        `${process.env.FRONTEND_URL}/pago-estado?transaccion=${id_transaccion}`,
      );
    } catch (error) {
      console.error("Error en la redirección de checkout:", error.message);
      return res.redirect(
        `${process.env.FRONTEND_URL}/error-fatal?transaccion=${id_transaccion}`,
      );
    }
  },

  /**
   * @async
   * @function getPaymentStatus
   * @description Obtiene el estado actual de una transacción y opcionalmente fuerza una actualización.
   * @param {object} req - Objeto de solicitud de Express (con `id_transaccion` en `params` y `refresh` en `query`).
   * @param {object} res - Objeto de respuesta de Express.
   */
  async getPaymentStatus(req, res) {
    try {
      const { id_transaccion } = req.params;
      const { refresh } = req.query;
      const userId = req.user.id;

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

      let pagoMercado = await PagoMercado.findOne({
        where: { id_transaccion: transaccion.id },
        order: [["createdAt", "DESC"]],
      });

      if (needsRefresh && pagoMercado?.id_transaccion_pasarela) {
        console.log(
          `Forzando actualización de estado para transacción ${id_transaccion}`,
        );
        const updatedData = await pagoMercadoService.refreshPaymentStatus(
          transaccion.id,
          pagoMercado.id_transaccion_pasarela,
        );

        if (updatedData) {
          transaccion = updatedData.transaccion;
          pagoMercado = updatedData.pagoMercado;
        }
      }

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

// Exportar el controlador principal (para las rutas)
module.exports = paymentController;

// También exportar las funciones helper (si otros archivos las necesitan)
module.exports.verifySignature = verifySignature;
module.exports.extractDataId = extractDataId;
