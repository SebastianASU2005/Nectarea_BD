const transaccionService = require("../services/transaccion.service");
const pagoMercadoService = require("../services/pagoMercado.service");
const Transaccion = require("../models/transaccion");
const PagoMercado = require("../models/pagoMercado");
const { sequelize } = require("../config/database");
const crypto = require("crypto");
const Inversion = require("../models/inversion");
const { Transaction } = require("sequelize");

// Mapeo de estados MP a estados internos
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
 * 🔑 FUNCIÓN DE VALIDACIÓN CRÍTICA DE LA FIRMA (Optimizado y Seguro)
 * Utiliza la clave secreta, las cabeceras y el cuerpo para verificar la autenticidad del webhook.
 */
function verifySignature(req) {
  const secret = process.env.MP_WEBHOOK_SECRET?.trim();
  const signatureHeader = req.headers["x-signature"];
  const requestId = req.headers["x-request-id"];
  const dataId = req.body?.data?.id || req.query.id || req.query["data.id"];

  console.log("🔐 VALIDACIÓN DE FIRMA");
  console.log("Secret presente:", !!secret);
  console.log("Signature presente:", !!signatureHeader);
  console.log("Request ID:", requestId);
  console.log("Data ID:", dataId);

  // ⚠️ Si falta algún dato, RECHAZA inmediatamente
  if (!secret) {
    console.error("❌ CRÍTICO: MP_WEBHOOK_SECRET no configurado");
    return false;
  }

  if (!signatureHeader || !requestId || !dataId) {
    console.error("❌ Headers o data.id faltantes");
    return false;
  }

  // Parsear ts y v1
  const parts = signatureHeader.split(",");
  let ts, v1;
  
  for (const part of parts) {
    const [key, value] = part.split("=");
    if (key?.trim() === "ts") ts = value?.trim();
    if (key?.trim() === "v1") v1 = value?.trim();
  }

  if (!ts || !v1) {
    console.error("❌ No se pudo extraer ts o v1");
    return false;
  }

  // Construir manifiesto EXACTO (sin espacios extra)
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  
  console.log("📋 Manifest:", manifest);

  // Calcular HMAC
  const localHash = crypto
    .createHmac("sha256", secret)
    .update(manifest)
    .digest("hex");

  console.log("🔒 Hash local:", localHash);
  console.log("🔒 Hash MP:   ", v1);
  console.log("✅ Match:", localHash === v1);

  return localHash === v1;
}

const paymentController = {
  /**
   * ✨ ENDPOINT GENÉRICO: Crea NUEVO checkout o regenera checkout para una transacción existente.
   */
  async createCheckoutGenerico(req, res) {
    const userId = req.user.id;
    const {
      id_transaccion,
      tipo_transaccion,
      monto,
      id_proyecto,
      id_inversion,
      id_puja,
      id_suscripcion,
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
        const datosTransaccion = {
          tipo_transaccion,
          monto,
          id_usuario: userId,
          id_proyecto,
          id_inversion,
          id_puja,
          id_suscripcion,
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
   * 🎯 Endpoint simplificado para inversiones
   */ async createCheckout(req, res) {
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
   * 🔔 WEBHOOK: Procesa notificaciones de Mercado Pago
   */ async handleWebhook(req, res) {
    // ⚠️ VALIDACIÓN CRÍTICA
    const isValid = verifySignature(req);

    if (!isValid) {
      console.error("🚫 FIRMA INVÁLIDA - RECHAZANDO WEBHOOK");
      console.error("IP:", req.ip);
      console.error("Headers:", JSON.stringify(req.headers, null, 2));

      // ⛔ NO PROCESAR NADA
      return res.status(401).send("Unauthorized");
    }

    console.log("✅ Firma válida - Procesando webhook");

    const { metodo } = req.params;
    let transaccionId = null;

    console.log("--- WEBHOOK INGRESO (Firma Validada) ---");
    // No es necesario logear el body completo si es muy grande, pero dejamos los query params
    console.log("Query:", req.query);
    console.log("-----------------------");

    const { topic, id } = req.query; // Aseguramos que topic e id estén disponibles

    if (topic === "merchant_order" && id) {
      try {
        console.log(
          `🔄 Merchant Order ${id} recibida. Buscando pagos asociados...`
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
    // Si no es 'merchant_order', el flujo continúa asumiendo que es un 'payment'.

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
      const transaccion = await Transaccion.findByPk(transaccionId, {
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
        console.warn(`PagoMercado no encontrado. Creando registro de pago.`);
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
        await pagoMercado.update(pagoData, { transaction: t });
      }

      if (internalStatus === "aprobado") {
        console.log(
          `✅ Pago ${transactionId} APROBADO. Ejecutando lógica de negocio...`
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

        console.warn(
          `❌ Pago ${transactionId} ${internalStatus.toUpperCase()}. Procesando fallo/devolución.`
        );

        await transaccionService.procesarFalloTransaccion(
          transaccion.id,
          newStatus,
          `Pago ${internalStatus}: ${status}`,
          { transaction: t }
        );
      } else {
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
      await t.rollback();
      console.error(
        `❌ Error CRÍTICO en webhook (Transacción ${transaccionId}):`,
        error.message
      );

      if (transaccionId) {
        try {
          await Transaccion.update(
            {
              estado_transaccion: "fallido",
              error_detalle: `Error fatal en webhook: ${error.message}`,
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
   * ✨ Inicia el proceso de pago de un registro pendiente
   */ async iniciarPagoPorModelo(req, res) {
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
   * ↩️ REDIRECCIÓN: Maneja la respuesta GET del usuario desde la pasarela de pago (Success, Failure, Pending).
   */ async handleCheckoutRedirect(req, res) {
    const { id_transaccion, collection_status, status } = req.query; // Obtener parámetros de la URL
    if (!id_transaccion) {
      return res
        .status(400)
        .send("ID de Transacción requerido para la redirección.");
    }
    try {
      // Usamos collection_status o status para determinar si el usuario canceló
      const finalStatus = collection_status || status;
      if (
        finalStatus === "rejected" ||
        finalStatus === "cancelled" ||
        finalStatus === "failure"
      ) {
        console.log(
          `Usuario canceló o pago rechazado para Transacción ${id_transaccion}. Marcando como fallido.`
        );
        await transaccionService.cancelarTransaccionPorUsuario(id_transaccion);
        return res.redirect(
          `${process.env.FRONTEND_URL}/pago-fallido?transaccion=${id_transaccion}`
        );
      }
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
          `Forzando actualización de estado de MP para transacción ${id_transaccion}`
        );

        const updatedData = await pagoMercadoService.refreshPaymentStatus(
          transaccion.id,
          pagoMercado.id_transaccion_pasarela
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
