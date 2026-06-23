// Archivo: controllers/pagoMercado.controller.js
// VERSIÓN CORREGIDA – Seguridad ante reembolsos indebidos
// 🔥 MEJORA: Verificación de estado final ANTES de cualquier reembolso
// 🔥 MEJORA: Creación de registro faltante en PagoMercado para pagos ya finalizados
// 🔥 MEJORA: Protección contra reembolsos de pagos antiguos legítimos

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
const User = require("../models/usuario");

const MP_STATUS_MAP = {
  approved: "aprobado",
  pending: "en_proceso",
  in_process: "en_proceso",
  rejected: "rechazado",
  cancelled: "rechazado",
  refunded: "devuelto",
  charged_back: "devuelto",
};

// ========== COOLDOWN PARA REFRESH ==========
const refreshCooldown = new Map(); // transaccionId -> timestamp último refresh
const REFRESH_COOLDOWN_MS = 15000; // 15 segundos mínimo entre refrescos de la misma transacción

// Limpieza automática de cooldowns viejos cada 5 minutos
setInterval(() => {
  const now = Date.now();
  for (const [txId, lastTime] of refreshCooldown.entries()) {
    if (now - lastTime > 60000) {
      refreshCooldown.delete(txId);
    }
  }
}, 300000);

const processedRefunds = new Set();
const pendingRetries = new Map();
const processingPayments = new Set();
const refundNotified = new Set();

// ========== FUNCIONES AUXILIARES ==========
function verifySignatureForId(req, dataId) {
  const secret = process.env.MP_WEBHOOK_SECRET?.trim();
  const signatureHeader = req.headers["x-signature"];
  const requestId = req.headers["x-request-id"];
  if (!secret || !signatureHeader) return false;
  const parts = signatureHeader.split(",");
  let ts = null,
    v1 = null;
  for (const part of parts) {
    const [key, value] = part.split("=");
    if (key?.trim() === "ts") ts = value?.trim();
    if (key?.trim() === "v1") v1 = value?.trim();
  }
  if (!ts || !v1) return false;
  const computeHash = (manifest) =>
    crypto.createHmac("sha256", secret).update(manifest).digest("hex");
  if (requestId) {
    const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
    if (computeHash(manifest) === v1) return true;
  }
  const manifestNoReq = `id:${dataId};ts:${ts};`;
  return computeHash(manifestNoReq) === v1;
}

function extractDataId(req) {
  const topic =
    req.query.topic || req.body?.topic || req.query.type || req.body?.type;
  let dataId = req.query.id || req.query["data.id"] || req.body?.data?.id;
  if (!dataId && (topic === "merchant_order" || topic === "order")) {
    const resource = req.body?.resource || req.query.resource;
    if (resource && typeof resource === "string") {
      const match = resource.match(/\/merchant_orders\/(\d+)/);
      if (match && match[1]) dataId = match[1];
    }
  }
  if (dataId && typeof dataId === "string" && dataId.startsWith("http")) {
    dataId = dataId.split("/").pop();
  }
  return dataId;
}

async function reembolsarPagoDuplicado(
  transaccion,
  paymentIdStr,
  metodo,
  esReintento = false,
) {
  try {
    const resultado = await pagoMercadoService.realizarReembolso(
      paymentIdStr,
      parseFloat(transaccion.monto),
    );
    const exito =
      resultado?.success === true || resultado?.alreadyRefunded === true;
    if (exito) {
      if (resultado?.success === true)
        console.log(`✅ Reembolso exitoso para pago ${paymentIdStr}`);
      else console.log(`ℹ️ El pago ${paymentIdStr} ya estaba reembolsado.`);

      const saveT = await sequelize.transaction();
      try {
        const now = new Date();
        const [pago, created] = await PagoMercado.findOrCreate({
          where: { id_transaccion_pasarela: paymentIdStr },
          defaults: {
            id_transaccion: transaccion.id,
            monto_pagado: transaccion.monto,
            metodo_pasarela: metodo,
            estado: "devuelto",
            detalles_raw: {
              duplicado: true,
              fecha: now.toISOString(),
              resultado: resultado?.success ? "exitoso" : "ya_reembolsado",
            },
            createdAt: now,
            updatedAt: now,
          },
          transaction: saveT,
        });
        if (created)
          console.log(
            `✅ Registro del pago duplicado guardado en BD para ${paymentIdStr}`,
          );
        await saveT.commit();
      } catch (dbErr) {
        await saveT.rollback();
        console.error(
          `❌ Error al guardar pago duplicado en BD:`,
          dbErr.message,
        );
      }

      // ========== NOTIFICAR SOLO UNA VEZ POR PAYMENT ID ==========
      if (!refundNotified.has(paymentIdStr)) {
        refundNotified.add(paymentIdStr);
        setTimeout(() => refundNotified.delete(paymentIdStr), 3600000);

        const user = await User.findByPk(transaccion.id_usuario);
        if (user) {
          await emailService.notificarReembolsoUsuario(
            user,
            transaccion,
            `Pago duplicado reembolsado correctamente.`,
            true,
          );
          const admins = await usuarioService.findAllAdmins();
          for (const admin of admins) {
            if (admin.email) {
              await emailService.notificarReembolsoAdminMejorada(
                admin.email,
                user,
                transaccion,
                `REEMBOLSO EXITOSO - Pago duplicado MP ${paymentIdStr}`,
                { reembolsoExitoso: true, idPagoMP: paymentIdStr },
              );
            }
          }
        }
      }

      processedRefunds.add(paymentIdStr);
      setTimeout(() => processedRefunds.delete(paymentIdStr), 60000);
      return;
    }
    if (resultado?.pending === true && !esReintento) {
      console.log(
        `⏰ Reembolso pendiente para ${paymentIdStr}. Reintentando en 5 segundos...`,
      );
      const timeoutId = setTimeout(async () => {
        pendingRetries.delete(paymentIdStr);
        await reembolsarPagoDuplicado(transaccion, paymentIdStr, metodo, true);
      }, 5000);
      pendingRetries.set(paymentIdStr, timeoutId);
      return;
    }
    console.error(
      `❌ Reembolso falló para ${paymentIdStr}: ${resultado?.message || "sin detalles"}`,
    );
    if (!processedRefunds.has(paymentIdStr)) {
      processedRefunds.add(paymentIdStr);
      const user = await User.findByPk(transaccion.id_usuario);
      if (user) {
        await emailService.notificarReembolsoUsuario(
          user,
          transaccion,
          `El sistema intentó reembolsar un pago duplicado pero falló: ${resultado?.message}`,
          false,
        );
        const admins = await usuarioService.findAllAdmins();
        for (const admin of admins) {
          if (admin.email) {
            await emailService.notificarReembolsoAdminMejorada(
              admin.email,
              user,
              transaccion,
              `FALLO EN REEMBOLSO - Pago duplicado MP ${paymentIdStr}`,
              {
                reembolsoExitoso: false,
                errorReembolso: resultado?.message,
                idPagoMP: paymentIdStr,
              },
            );
          }
        }
      }
    }
  } catch (err) {
    console.error(
      `Error crítico en reembolso para ${paymentIdStr}:`,
      err.message,
    );
    if (!processedRefunds.has(paymentIdStr)) {
      processedRefunds.add(paymentIdStr);
      const user = await User.findByPk(transaccion.id_usuario);
      if (user) {
        await emailService.notificarReembolsoUsuario(
          user,
          transaccion,
          `Error inesperado al intentar reembolsar : ${err.message}`,
          false,
        );
      }
    }
  }
}

// ========== CONTROLADOR PRINCIPAL ==========
const paymentControllerObj = {
  async createCheckoutGenerico(req, res) {
    const userId = req.user.id;
    const { id_transaccion, metodo = "mercadopago" } = req.body;
    if (metodo !== "mercadopago") {
      return res
        .status(400)
        .json({ error: "Solo 'mercadopago' está soportado actualmente." });
    }
    const t = await sequelize.transaction();
    try {
      let transaccion, pagoMercado, redirectUrl;
      if (id_transaccion) {
        transaccion = await Transaccion.findByPk(id_transaccion, {
          transaction: t,
        });
        if (!transaccion || transaccion.id_usuario !== userId)
          throw new Error("Transacción no encontrada o no te pertenece.");
        if (transaccion.estado_transaccion === "pagado")
          throw new Error(`La transacción ${id_transaccion} ya está pagada.`);
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
      res.status(500).json({ error: error.message });
    }
  },

  async forceConciliation(req, res) {
    try {
      const {
        conciliatePendingPayments,
      } = require("../tasks/conciliatePendingPayments");
      await conciliatePendingPayments();
      res.status(200).json({ message: "Conciliación forzada ejecutada." });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async createCheckout(req, res) {
    const userId = req.user.id;
    const { id_inversion, metodo = "mercadopago" } = req.body;
    if (!id_inversion)
      return res.status(400).json({ error: "id_inversion es requerido" });
    const inversion = await Inversion.findOne({
      where: { id: id_inversion, id_usuario: userId, estado: "pendiente" },
    });
    if (!inversion)
      return res
        .status(404)
        .json({ error: "Inversión no encontrada o ya fue pagada." });
    req.body = {
      tipo_transaccion: "directo",
      monto: parseFloat(inversion.monto),
      id_proyecto: inversion.id_proyecto,
      id_inversion: inversion.id,
      metodo,
    };
    return this.createCheckoutGenerico(req, res);
  },

  async handleWebhook(req, res) {
    const topic =
      req.query.topic || req.body?.topic || req.query.type || req.body?.type;
    let dataId = extractDataId(req);
    const { metodo } = req.params;

    if (!topic || !dataId) {
      console.log("Webhook sin topic o id, ignorado");
      return res.status(200).send("OK");
    }

    // ========== VERIFICACIÓN DE FIRMA ==========
    const signatureValid = verifySignatureForId(req, dataId);
    if (!signatureValid) {
      console.error(
        `🚫 Firma inválida para ${topic} ID ${dataId}. Rechazando webhook.`,
      );
      return res.status(401).send("Firma inválida");
    }
    console.log(`✅ Firma verificada correctamente para ${topic} ID ${dataId}`);

    if (topic === "merchant_order" || topic === "topic_merchant_order_wh") {
      console.log(`ℹ️ Notificación de Merchant Order ${dataId} ignorada.`);
      return res.status(200).send("OK - Merchant Order ignorada");
    }
    if (topic !== "payment") {
      console.log(`Topic no soportado: ${topic}, ignorado`);
      return res.status(200).send("OK");
    }

    const paymentResult = await pagoMercadoService.verifyAndFetchPayment(
      req,
      metodo,
    );
    if (!paymentResult || !paymentResult.transaccionId) {
      console.log("Webhook: Sin datos de pago válidos");
      return res.status(200).send("OK - Sin acción");
    }

    const {
      transaccionId: id_transaccion,
      status,
      paymentDetails,
      transactionId,
      rawDetails,
    } = paymentResult;
    const transactionIdStr = String(transactionId);
    const internalStatus = MP_STATUS_MAP[status] || "en_proceso";

    if (processingPayments.has(transactionIdStr)) {
      console.log(
        `⏳ Pago ${transactionIdStr} ya está siendo procesado. Ignorando webhook duplicado.`,
      );
      return res.status(200).send("OK - en proceso");
    }
    processingPayments.add(transactionIdStr);

    try {
      // 🔍 PRIMERO: Verificar si el pago ya existe en BD (rápido)
      const pagoExistente = await PagoMercado.findOne({
        where: { id_transaccion_pasarela: transactionIdStr },
      });
      if (pagoExistente) {
        console.log(
          `ℹ️ El pago MP ${transactionIdStr} ya fue registrado (estado: ${pagoExistente.estado}). Ignorando webhook.`,
        );
        return res.status(200).send("OK - Pago ya registrado");
      }

      let transaccion;
      const t = await sequelize.transaction({
        isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED,
      });

      try {
        transaccion = await Transaccion.findByPk(id_transaccion, {
          transaction: t,
          lock: t.LOCK.UPDATE,
        });
        if (!transaccion) {
          await t.rollback();
          console.error(`Transacción ${id_transaccion} no encontrada.`);
          return res.status(404).send("Transacción no encontrada");
        }

        // ========== 🔥 NUEVA REGLA DE ORO: Estado final ==========
        const estadosFinales = ["pagado", "fallido", "reembolsado", "expirado"];
        if (estadosFinales.includes(transaccion.estado_transaccion)) {
          await t.rollback(); // Liberamos la transacción
          console.log(
            `⏳ Transacción ${id_transaccion} ya está en estado final (${transaccion.estado_transaccion}). Ignorando webhook del pago ${transactionIdStr}.`,
          );
          // Crear el registro faltante para que no se repita el webhook
          await PagoMercado.create({
            id_transaccion: transaccion.id,
            monto_pagado: transaccion.monto,
            metodo_pasarela: metodo,
            estado: internalStatus, // Usamos el estado que vino en el webhook
            id_transaccion_pasarela: transactionIdStr,
            tipo_medio_pago: paymentDetails?.payment_method_type,
            fecha_aprobacion: paymentDetails?.date_approved,
            detalles_raw: {
              ...rawDetails,
              webhook_ignorado_por_estado_final: true,
            },
          });
          console.log(
            `✅ Registro faltante creado para pago ${transactionIdStr} (transacción ya finalizada).`,
          );
          return res.status(200).send("OK - Transacción ya finalizada");
        }

        // ========== FLUJO NORMAL: Transacción NO pagada ==========
        let pagoMercado = await PagoMercado.findOne({
          where: { id_transaccion: transaccion.id },
          transaction: t,
        });

        const pagoData = {
          estado: internalStatus,
          id_transaccion_pasarela: transactionIdStr,
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
          await transaccionService.confirmarTransaccion(transaccion.id, {
            transaction: t,
          });
          console.log(
            `[Webhook] internalStatus=${internalStatus}, transaccion.id=${transaccion.id}`,
          );
          processedRefunds.add(transactionIdStr);
          setTimeout(() => processedRefunds.delete(transactionIdStr), 60000);
        } else if (
          ["rechazado", "devuelto", "en_proceso"].includes(internalStatus)
        ) {
          let newStatus = "fallido";
          if (internalStatus === "rechazado") newStatus = "fallido";
          else if (internalStatus === "devuelto") newStatus = "reembolsado";
          else newStatus = "en_proceso";
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
          `✅ Webhook procesado: Transacción ${id_transaccion} -> ${internalStatus}`,
        );
        return res.status(200).send("OK");
      } catch (error) {
        await t.rollback();
        console.error(`❌ Error en webhook:`, error.message);

        // ========== MANEJO DE ERRORES ==========
        // Lista de errores que SÍ deben reembolsar (pero solo si la transacción NO está en estado final)
        const erroresReembolsables = [
          // "DUPLICADO_ENTIDAD", // ELIMINADO para evitar reembolsos de pagos antiguos
          "ya no está disponible para inversión",
          "proyecto ya no está disponible",
          "proyecto está en estado: Finalizado",
          "proyecto está en estado: Cancelado",
          "Transacción expiró",
          "ya fue revertida",
        ];

        // 🔥 Verificar si el error debe reembolsar
        const debeReembolsar = erroresReembolsables.some((msg) =>
          error.message.includes(msg),
        );

        // 🔥 Si el error es DUPLICADO_ENTIDAD, lo manejamos de forma especial:
        // solo reembolsamos si la transacción NO está en estado final (por si acaso)
        const esDuplicadoEntidad = error.message.includes("DUPLICADO_ENTIDAD");

        if (debeReembolsar || esDuplicadoEntidad) {
          // Obtener la transacción nuevamente (puede que no esté en el scope)
          const transaccionActual = await Transaccion.findByPk(id_transaccion);
          if (!transaccionActual) {
            console.error(
              `No se pudo obtener la transacción ${id_transaccion} para evaluar reembolso.`,
            );
            return res.status(200).send("OK - Error interno");
          }

          // Si la transacción ya está en estado final, NO reembolsamos
          if (estadosFinales.includes(transaccionActual.estado_transaccion)) {
            console.log(
              `⚠️ Error "${error.message}" pero la transacción ${id_transaccion} ya está en estado final (${transaccionActual.estado_transaccion}). NO se reembolsa.`,
            );
            // Guardar registro faltante si no existe
            const existing = await PagoMercado.findOne({
              where: { id_transaccion_pasarela: transactionIdStr },
            });
            if (!existing) {
              await PagoMercado.create({
                id_transaccion: transaccionActual.id,
                monto_pagado: transaccionActual.monto,
                metodo_pasarela: metodo,
                estado: internalStatus || "aprobado",
                id_transaccion_pasarela: transactionIdStr,
                detalles_raw: {
                  ...rawDetails,
                  webhook_ignorado_por_estado_final_y_error: true,
                  error: error.message,
                },
              });
              console.log(
                `✅ Registro faltante creado para pago ${transactionIdStr} (estado final).`,
              );
            }
            return res.status(200).send("OK - Error en estado final, ignorado");
          }

          // Si la transacción NO está en estado final, procedemos con el reembolso
          console.log(
            `⚠️ Error reembolsable detectado: "${error.message}". Reembolsando pago MP ${transactionIdStr}...`,
          );
          if (pendingRetries.has(transactionIdStr)) {
            clearTimeout(pendingRetries.get(transactionIdStr));
            pendingRetries.delete(transactionIdStr);
          }
          await reembolsarPagoDuplicado(
            transaccionActual,
            transactionIdStr,
            metodo,
            false,
          );
          return res.status(200).send("OK - Reembolsado por error de negocio");
        }

        // Si no es un error reembolsable, solo registramos y devolvemos OK
        if (error.name === "SequelizeValidationError") {
          console.error("🔍 Detalles de validación:", error.errors);
        }
        return res.status(200).send("OK - Error interno no reembolsable");
      }
    } finally {
      processingPayments.delete(transactionIdStr);
    }
  },

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
        modelo,
        modeloId: idNumerico,
        redirectUrl,
      });
    } catch (error) {
      console.error(
        `Error en el checkout genérico para ${req.params.modelo}:`,
        error.message,
      );
      res.status(400).json({ error: error.message });
    }
  },

  async handleCheckoutRedirect(req, res) {
    const { id_transaccion, collection_status, status } = req.query;
    if (!id_transaccion)
      return res
        .status(400)
        .send("ID de Transacción requerido para la redirección.");
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

  async getPaymentStatus(req, res) {
    try {
      const { id_transaccion } = req.params;
      const { refresh } = req.query;
      const userId = req.user.id;

      let transaccion = await Transaccion.findOne({
        where: { id: id_transaccion, id_usuario: userId },
      });
      if (!transaccion) {
        return res
          .status(404)
          .json({ error: "Transacción no encontrada o no te pertenece." });
      }

      const statusFinal = ["pagado", "fallido", "reembolsado", "expirado"];
      const needsRefresh =
        refresh === "true" &&
        !statusFinal.includes(transaccion.estado_transaccion);

      let pagoMercado = await PagoMercado.findOne({
        where: { id_transaccion: transaccion.id },
        order: [["createdAt", "DESC"]],
      });

      // ========== CONTROL DE COOLDOWN ==========
      if (needsRefresh && pagoMercado?.id_transaccion_pasarela) {
        const now = Date.now();
        const lastRefresh = refreshCooldown.get(parseInt(id_transaccion));

        if (lastRefresh && now - lastRefresh < REFRESH_COOLDOWN_MS) {
          console.log(
            `⏸️ Cooldown activo para transacción ${id_transaccion} - refresh ignorado`,
          );
          return res.status(200).json({
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
            pagoPasarela: pagoMercado
              ? {
                  id: pagoMercado.id,
                  transaccionIdPasarela: pagoMercado.id_transaccion_pasarela,
                  monto: parseFloat(pagoMercado.monto_pagado),
                  estado: pagoMercado.estado,
                  metodo: pagoMercado.tipo_medio_pago,
                  fecha: pagoMercado.fecha_aprobacion || pagoMercado.createdAt,
                }
              : null,
            refreshCooldown: true,
          });
        }

        refreshCooldown.set(parseInt(id_transaccion), now);
        setTimeout(() => {
          if (refreshCooldown.get(parseInt(id_transaccion)) === now) {
            refreshCooldown.delete(parseInt(id_transaccion));
          }
        }, 60000);
      }

      if (needsRefresh && pagoMercado?.id_transaccion_pasarela) {
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

module.exports = paymentControllerObj;
module.exports.verifySignature = verifySignatureForId;
module.exports.extractDataId = extractDataId;
