// Archivo: controllers/pagoMercado.controller.js
// VERSIÓN CORREGIDA - CON VERIFICACIÓN TEMPRANA Y PREVENCIÓN DE REEMBOLSO DEL PAGO ORIGINAL

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

// Mapeo de estados de Mercado Pago a estados internos (coincide con enum de PagoMercado)
const MP_STATUS_MAP = {
  approved: "aprobado",
  pending: "en_proceso",
  in_process: "en_proceso",
  rejected: "rechazado",
  cancelled: "rechazado",
  refunded: "devuelto",
  charged_back: "devuelto",
};

// Almacenamiento temporal para evitar reintentos duplicados
const processedRefunds = new Set(); // Payment IDs ya procesados (éxito o ya reembolsado)
const pendingRetries = new Map(); // Timeouts activos para reintentos

// ==================== VALIDACIÓN DE FIRMA ====================
function verifySignatureForId(req, dataId) {
  const secret = process.env.MP_WEBHOOK_SECRET?.trim();
  const signatureHeader = req.headers["x-signature"];
  const requestId = req.headers["x-request-id"];

  if (!secret || !signatureHeader) {
    console.warn(`⚠️ verifySignatureForId: secret o firma ausente`);
    return false;
  }

  const parts = signatureHeader.split(",");
  let ts = null,
    v1 = null;
  for (const part of parts) {
    const [key, value] = part.split("=");
    if (key?.trim() === "ts") ts = value?.trim();
    if (key?.trim() === "v1") v1 = value?.trim();
  }
  if (!ts || !v1) {
    console.warn(`⚠️ verifySignatureForId: no se encontró ts o v1 en firma`);
    return false;
  }

  const computeHash = (manifest) =>
    crypto.createHmac("sha256", secret).update(manifest).digest("hex");

  if (requestId) {
    const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
    if (computeHash(manifest) === v1) {
      console.log(`✅ Firma válida (con request-id) para ID ${dataId}`);
      return true;
    }
  }

  const manifestNoReq = `id:${dataId};ts:${ts};`;
  if (computeHash(manifestNoReq) === v1) {
    console.log(`✅ Firma válida (sin request-id) para ID ${dataId}`);
    return true;
  }

  console.error(`🚫 Firma inválida para ID ${dataId}`);
  return false;
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

const paymentController = {
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

    console.log(
      `⚠️ [MODO PRUEBA] Validación de firma desactivada para ${topic} ID ${dataId}`,
    );

    // Ignorar Merchant Orders
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

    // ========== VERIFICACIÓN TEMPRANA: ¿Ya existe este paymentId? ==========
    const pagoExistente = await PagoMercado.findOne({
      where: { id_transaccion_pasarela: transactionIdStr },
    });
    if (pagoExistente) {
      console.log(
        `ℹ️ El pago MP ${transactionIdStr} ya fue registrado (estado: ${pagoExistente.estado}). Ignorando webhook.`,
      );
      return res.status(200).send("OK - Pago ya registrado");
    }

    const t = await sequelize.transaction({
      isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED,
    });

    try {
      let transaccion = await Transaccion.findByPk(id_transaccion, {
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      if (!transaccion) {
        await t.rollback();
        console.error(`Transacción ${id_transaccion} no encontrada.`);
        return res.status(404).send("Transacción no encontrada");
      }

      // ========== CASO: TRANSACCIÓN YA PAGADA (DUPLICADO REAL) ==========
      if (transaccion.estado_transaccion === "pagado") {
        // Verificar nuevamente (por concurrencia)
        const existing = await PagoMercado.findOne({
          where: { id_transaccion_pasarela: transactionIdStr },
          transaction: t,
          lock: t.LOCK.UPDATE,
        });
        if (existing) {
          console.log(
            `ℹ️ El pago MP ${transactionIdStr} ya fue registrado (estado: ${existing.estado}). Ignorando webhook.`,
          );
          await t.commit();
          return res.status(200).send("OK - Pago ya registrado");
        }

        console.log(
          `⚠️ Pago duplicado detectado para Transacción ${id_transaccion}. Reembolsando pago MP ${transactionIdStr}...`,
        );
        await t.rollback(); // No necesitamos la transacción actual para el reembolso

        // Cancelar reintentos pendientes
        if (pendingRetries.has(transactionIdStr)) {
          clearTimeout(pendingRetries.get(transactionIdStr));
          pendingRetries.delete(transactionIdStr);
        }

        // Función que ejecuta el reembolso y guarda en BD
        const ejecutarReembolso = async (esReintento = false) => {
          try {
            const resultado = await pagoMercadoService.realizarReembolso(
              transactionIdStr,
              parseFloat(transaccion.monto),
            );

            const exito =
              resultado?.success === true ||
              resultado?.alreadyRefunded === true;

            if (exito) {
              if (resultado?.success === true) {
                console.log(
                  `✅ Reembolso exitoso para pago ${transactionIdStr}`,
                );
              } else {
                console.log(
                  `ℹ️ El pago ${transactionIdStr} ya estaba reembolsado.`,
                );
              }

              // Guardar en BD (nueva transacción)
              const saveT = await sequelize.transaction();
              try {
                const [pago, created] = await PagoMercado.findOrCreate({
                  where: { id_transaccion_pasarela: transactionIdStr },
                  defaults: {
                    id_transaccion: transaccion.id,
                    monto_pagado: transaccion.monto,
                    metodo_pasarela: metodo,
                    estado: "devuelto",
                    detalles_raw: {
                      duplicado: true,
                      fecha: new Date().toISOString(),
                      resultado: resultado?.success
                        ? "exitoso"
                        : "ya_reembolsado",
                    },
                  },
                  transaction: saveT,
                });
                if (created) {
                  console.log(
                    `✅ Registro del pago duplicado guardado en BD para ${transactionIdStr}`,
                  );
                } else {
                  console.log(
                    `ℹ️ El pago ${transactionIdStr} ya existía en BD (estado: ${pago.estado})`,
                  );
                }
                await saveT.commit();
              } catch (dbErr) {
                await saveT.rollback();
                console.error(
                  `❌ Error al guardar pago duplicado en BD:`,
                  dbErr.message,
                );
                if (dbErr.name === "SequelizeValidationError") {
                  console.error("🔍 Detalles de validación:");
                  dbErr.errors.forEach((err) => {
                    console.error(
                      `  - Campo: ${err.path}, Valor: ${err.value}, Mensaje: ${err.message}`,
                    );
                  });
                }
              }

              // 🔁 NOTIFICACIONES (solo una vez, antes de marcar como procesado)
              if (!esReintento) {
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
                        `REEMBOLSO EXITOSO - Pago duplicado MP ${transactionIdStr}`,
                        { reembolsoExitoso: true, idPagoMP: transactionIdStr },
                      );
                    }
                  }
                }
              }

              // Marcar como procesado en memoria (después de notificar)
              processedRefunds.add(transactionIdStr);
              setTimeout(
                () => processedRefunds.delete(transactionIdStr),
                60000,
              );
              return;
            }

            // Reembolso pendiente (Movement operations pending)
            if (resultado?.pending === true && !esReintento) {
              console.log(
                `⏰ Reembolso pendiente para ${transactionIdStr}. Reintentando en 5 segundos...`,
              );
              const timeoutId = setTimeout(async () => {
                pendingRetries.delete(transactionIdStr);
                await ejecutarReembolso(true);
              }, 5000);
              pendingRetries.set(transactionIdStr, timeoutId);
              return;
            }

            // Otro error (fallo real)
            console.error(
              `❌ Reembolso falló para ${transactionIdStr}: ${resultado?.message || "sin detalles"}`,
            );
            if (!processedRefunds.has(transactionIdStr)) {
              processedRefunds.add(transactionIdStr);
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
                      `FALLO EN REEMBOLSO - Pago duplicado MP ${transactionIdStr}`,
                      {
                        reembolsoExitoso: false,
                        errorReembolso: resultado?.message,
                        idPagoMP: transactionIdStr,
                      },
                    );
                  }
                }
              }
            }
          } catch (err) {
            console.error(
              `Error crítico en reembolso para ${transactionIdStr}:`,
              err.message,
            );
            if (!processedRefunds.has(transactionIdStr)) {
              processedRefunds.add(transactionIdStr);
              const user = await User.findByPk(transaccion.id_usuario);
              if (user) {
                await emailService.notificarReembolsoUsuario(
                  user,
                  transaccion,
                  `Error inesperado al intentar reembolsar: ${err.message}`,
                  false,
                );
              }
            }
          }
        };

        await ejecutarReembolso(false);
        return res.status(200).send("OK - Duplicado procesado");
      }

      // ========== TRANSACCIÓN NO PAGADA (FLUJO NORMAL) ==========
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

      const estadosValidos = [
        "pendiente",
        "aprobado",
        "rechazado",
        "devuelto",
        "en_proceso",
      ];
      if (!estadosValidos.includes(pagoData.estado)) {
        console.error(
          `❌ Estado inválido detectado: ${pagoData.estado}. Se usará "en_proceso" como fallback.`,
        );
        pagoData.estado = "en_proceso";
      }

      console.log(
        "📦 Datos a guardar en PagoMercado:",
        JSON.stringify(pagoData, null, 2),
      );

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
      if (error.name === "SequelizeValidationError") {
        console.error("🔍 Detalles de validación:");
        error.errors.forEach((err) => {
          console.error(
            `  - Campo: ${err.path}, Valor: ${err.value}, Mensaje: ${err.message}`,
          );
        });
      }
      return res.status(200).send("OK - Error interno");
    }
  },

  // Las siguientes funciones permanecen sin cambios
  async verificarDuplicadoPorEntidad(transaccion) {
    const {
      tipo_transaccion,
      id_inversion,
      id_puja,
      id_pago_mensual,
      id_pago_adhesion,
      id,
    } = transaccion;
    let whereCondition = null,
      tipoEntidad = "";
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
        `🔍 Duplicado detectado: ${tipoEntidad} ya pagada en transacción ${otraTransaccion.id}`,
      );
      return { tipo: tipoEntidad, id: otraTransaccion.id };
    }
    return null;
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
        modelo: modelo,
        modeloId: idNumerico,
        redirectUrl: redirectUrl,
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
      const statusFinal = ["pagado", "fallido", "reembolsado"];
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

module.exports = paymentController;
module.exports.verifySignature = verifySignatureForId;
module.exports.extractDataId = extractDataId;
