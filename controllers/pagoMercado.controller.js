// Archivo: controllers/pagoMercado.controller.js
// VERSIÓN CORREGIDA - VALIDACIÓN ÚNICA DE FIRMA Y REEMBOLSO DIRECTO PARA DUPLICADOS

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

// ==================== VALIDACIÓN DE FIRMA (ÚNICA) ====================
function verifySignatureForId(req, dataId) {
  const secret = process.env.MP_WEBHOOK_SECRET?.trim();
  const signatureHeader = req.headers["x-signature"];
  const requestId = req.headers["x-request-id"];

  if (!secret || !signatureHeader) {
    console.warn(`⚠️ verifySignatureForId: secret o firma ausente`);
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
    console.warn(`⚠️ verifySignatureForId: no se encontró ts o v1 en firma`);
    return false;
  }

  const computeHash = (manifest) =>
    crypto.createHmac("sha256", secret).update(manifest).digest("hex");

  // Intentar con request-id (si existe)
  if (requestId) {
    const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
    const hash = computeHash(manifest);
    console.log(`🔍 DEBUG: manifest con request-id: ${manifest}`);
    console.log(`🔍 DEBUG: hash calculado: ${hash}`);
    console.log(`🔍 DEBUG: v1 recibido: ${v1}`);
    if (hash === v1) {
      console.log(`✅ Firma válida (con request-id) para ID ${dataId}`);
      return true;
    }
  }

  // Sin request-id
  const manifestNoReq = `id:${dataId};ts:${ts};`;
  const hashNoReq = computeHash(manifestNoReq);
  console.log(`🔍 DEBUG: manifest sin request-id: ${manifestNoReq}`);
  console.log(`🔍 DEBUG: hash calculado: ${hashNoReq}`);
  console.log(`🔍 DEBUG: v1 recibido: ${v1}`);
  if (hashNoReq === v1) {
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
  /**
   * Crea un nuevo checkout o regenera uno para una transacción existente.
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
      res.status(500).json({ error: error.message });
    }
  },

  /**
   * Endpoint simplificado para generar un checkout de pago para una Inversión pendiente.
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
   * WEBHOOK CRÍTICO: Procesa notificaciones de Mercado Pago.
   */
  async handleWebhook(req, res) {
    // 1. Extraer topic e ID real (sin validación aún)
    const topic =
      req.query.topic || req.body?.topic || req.query.type || req.body?.type;
    let dataId = extractDataId(req);
    const { metodo } = req.params;

    if (!topic || !dataId) {
      console.log("Webhook sin topic o id, ignorado");
      return res.status(200).send("OK");
    }

    // 2. Validar firma usando el ID real (única validación)
    if (!verifySignatureForId(req, dataId)) {
      console.error(`🚫 FIRMA INVÁLIDA para ${topic} ID ${dataId}`);
      return res.status(401).send("Unauthorized");
    }
    console.log(`✅ Firma válida para ${topic} ID ${dataId}`);

    // 3. Manejar Merchant Order
    if (topic === "merchant_order" || topic === "topic_merchant_order_wh") {
      try {
        console.log(`🔄 Merchant Order ${dataId} recibida. Procesando...`);
        await pagoMercadoService.procesarPagosDeMerchantOrder(dataId);
        console.log(`✅ Merchant Order ${dataId} procesada.`);
        return res.status(200).send("OK - Merchant Order procesada");
      } catch (error) {
        console.error(
          `❌ Error al procesar Merchant Order ${dataId}:`,
          error.message,
        );
        return res.status(200).send("OK - Error en procesamiento de MO");
      }
    }

    // 4. Solo pagos (topic === "payment")
    if (topic !== "payment") {
      console.log(`Topic no soportado: ${topic}, ignorado`);
      return res.status(200).send("OK");
    }

    // 5. Obtener detalles del pago
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
    const internalStatus = MP_STATUS_MAP[status] || "en_proceso";

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

      // ----- CASO: Transacción YA PAGADA -----
      if (transaccion.estado_transaccion === "pagado") {
        const duplicado =
          await paymentController.verificarDuplicadoPorEntidad(transaccion);
        if (duplicado) {
          console.log(
            `⚠️ Pago duplicado detectado para ${duplicado.tipo}. Reembolsando pago MP ${transactionId}...`,
          );
          await t.rollback(); // No necesitamos la transacción actual

          // REEMBOLSO DIRECTO
          let reembolsoExitoso = false;
          let errorReembolso = null;
          try {
            const resultado = await pagoMercadoService.realizarReembolso(
              transactionId,
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

          // Guardar registro del pago duplicado (auditoría)
          try {
            await PagoMercado.create({
              id_transaccion: transaccion.id,
              monto_pagado: transaccion.monto,
              metodo_pasarela: metodo,
              id_transaccion_pasarela: transactionId,
              estado: reembolsoExitoso ? "reembolsado" : "fallido",
              detalles_raw: { error: errorReembolso, duplicado: true },
            });
          } catch (dbErr) {
            console.error(
              "No se pudo guardar el pago duplicado:",
              dbErr.message,
            );
          }

          // Notificaciones
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
                  `PAGO DUPLICADO (misma entidad ${duplicado.tipo}) - Payment MP ${transactionId}`,
                  { reembolsoExitoso, errorReembolso, idPagoMP: transactionId },
                );
              }
            }
          }
          return res.status(200).send("OK - Duplicado reembolsado");
        }

        // No es duplicado, ignorar
        await t.commit();
        console.log(
          `Transacción ${id_transaccion} ya procesada. Webhook ignorado.`,
        );
        return res.status(200).send("OK - Ya procesado");
      }

      // ----- Transacción NO pagada todavía -----
      let pagoMercado = await PagoMercado.findOne({
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
        await transaccionService.confirmarTransaccion(transaccion.id, {
          transaction: t,
        });
      } else if (
        ["rechazado", "devuelto", "en_proceso"].includes(internalStatus)
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
        `✅ Webhook procesado: Transacción ${id_transaccion} -> ${internalStatus}`,
      );
      return res.status(200).send("OK");
    } catch (error) {
      await t.rollback();
      console.error(`❌ Error en webhook:`, error.message);
      return res.status(200).send("OK - Error interno");
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

  /**
   * Endpoint genérico que inicia una transacción y checkout para cualquier modelo
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
      res.status(400).json({ error: error.message });
    }
  },

  /**
   * Redirección: Maneja la respuesta GET del usuario desde la pasarela de pago.
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
   * Obtiene el estado actual de una transacción y opcionalmente fuerza actualización.
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

// Exportar el controlador principal
module.exports = paymentController;

// Exportar helpers (opcional)
module.exports.verifySignature = verifySignatureForId; // Para compatibilidad si alguien lo usa
module.exports.extractDataId = extractDataId;
