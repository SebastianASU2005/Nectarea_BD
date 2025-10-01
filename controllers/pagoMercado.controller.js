// controllers/pagoMercado.controller.js

// Importaciones de Modelos y Servicios
const paymentService = require("../services/pagoMercado.service");
const Inversion = require("../models/inversion");
const PagoMercado = require("../models/pagoMercado");
const Transaccion = require("../models/transaccion");
const transaccionService = require("../services/transaccion.service");
const { sequelize } = require("../config/database");

// Mapeo de estados de Mercado Pago a nuestros estados internos
const MP_STATUS_MAP = {
  approved: "aprobado",
  pending: "en_proceso",
  in_process: "en_proceso",
  rejected: "rechazado",
  cancelled: "rechazado",
  refunded: "devuelto",
};

const paymentController = {
  /**
   * @function createCheckout
   * @description Crea una preferencia de pago en Mercado Pago.
   */
  async createCheckout(req, res) {
    // Asume que req.user está disponible gracias a un middleware de autenticación
    // CORRECCIÓN: Usar el campo que estés usando para el ID de usuario (e.g., req.user.id o req.user.uid)
    const userId = req.user.id;
    const { id_inversion, metodo } = req.body;

    if (metodo !== "mercadopago") {
      return res
        .status(400)
        .json({
          error: "Solo 'mercadopago' está implementado en este momento.",
        });
    }

    const t = await sequelize.transaction();
    try {
      // 1. Verificar Inversión y crear Transacción 'directo' si no existe
      const inversion = await Inversion.findOne({
        where: { id: id_inversion, id_usuario: userId, estado: "pendiente" },
        transaction: t,
      });

      if (!inversion) {
        await t.rollback();
        return res
          .status(404)
          .json({
            error: "Inversión no encontrada, no te pertenece o ya fue pagada.",
          });
      }

      let transaccion = await Transaccion.findOne({
        where: { id_inversion: inversion.id, estado_transaccion: "pendiente" },
        transaction: t,
      });

      if (!transaccion) {
        // Crear Transacción asociada a la Inversión
        transaccion = await Transaccion.create(
          {
            tipo_transaccion: "directo",
            monto: inversion.monto,
            id_usuario: userId,
            id_proyecto: inversion.id_proyecto,
            id_inversion: inversion.id,
            estado_transaccion: "pendiente",
          },
          { transaction: t }
        );
      } // 2. Llamar al servicio de MP para generar la URL de pago, usando el ID de la Transaccion

      const { preferenceId, redirectUrl } =
        await paymentService.createPaymentSession(
          inversion,
          transaccion.id // ID de la Transaccion como external_reference
        ); // 3. Crear o actualizar un registro de PagoMercado

      let pagoMercado = await PagoMercado.findOne({
        where: { id_transaccion: transaccion.id, estado: "pendiente" },
        transaction: t,
      });

      if (!pagoMercado) {
        pagoMercado = await PagoMercado.create(
          {
            id_transaccion: transaccion.id, // Vinculación CLAVE
            monto_pagado: inversion.monto,
            metodo_pasarela: metodo,
            id_transaccion_pasarela: preferenceId,
            estado: "pendiente",
          },
          { transaction: t }
        );
      } else {
        await pagoMercado.update(
          { id_transaccion_pasarela: preferenceId },
          { transaction: t }
        );
      } // 4. Vincular la Transacción con el ID del PagoMercado // Esta línea podría ser redundante si ya se hizo arriba, pero está bien como seguro.

      await transaccion.update({ id_pago: pagoMercado.id }, { transaction: t });
      await t.commit(); // 5. Devolver la URL de redirección al frontend

      res.status(200).json({
        success: true,
        transaccionId: transaccion.id,
        redirectUrl,
      });
    } catch (error) {
      await t.rollback();
      console.error(
        `Error al crear sesión de pago (${metodo}):`,
        error.message
      );
      res
        .status(500)
        .json({
          error:
            "Error interno al iniciar el proceso de pago: " + error.message,
        });
    }
  }
  /**
   * @function handleWebhook
   * @description Endpoint para recibir notificaciones (Webhooks) de Mercado Pago.
   */,

  async handleWebhook(req, res) {
    // CRÍTICO: Responder 200 OK inmediatamente. La lógica de negocio va después,
    // pero la respuesta a MP debe ser rápida para evitar reintentos.
    res.status(200).send("OK");
    const t = await sequelize.transaction();
    try {
      const { metodo } = req.params; // 1. Verificación y Fetch de Detalles de Pago desde MP // El servicio debe verificar la firma/tópico y obtener el ID de Transacción // y el estado final desde la API de MP.

      const paymentResult = await paymentService.verifyAndFetchPayment(
        req,
        metodo
      );

      if (!paymentResult || !paymentResult.transaccionId) {
        await t.commit(); // No hay nada que hacer, solo cerrar la transacción.
        return console.log(
          "Webhook: Notificación recibida, no procesada o irrelevante."
        );
      } // 2. Extraer Datos
      const {
        transaccionId,
        status,
        paymentDetails,
        transactionId,
        rawDetails,
      } = paymentResult;
      const internalStatus = MP_STATUS_MAP[status] || "pendiente"; // 3. Buscar Transacción y PagoMercado
      const transaccion = await Transaccion.findByPk(transaccionId, {
        transaction: t,
      });
      if (!transaccion) {
        await t.rollback();
        return console.error(
          `Webhook: Transacción ID ${transaccionId} no encontrada.`
        );
      } // Idempotencia: Si ya está pagada, salimos.
      if (transaccion.estado_transaccion === "pagado") {
        await t.commit();
        return console.log(
          `Webhook: Pago de Transacción ${transaccionId} ya procesado.`
        );
      } // Buscamos el PagoMercado asociado
      let pagoMercado = await PagoMercado.findOne({
        where: { id_transaccion: transaccion.id },
        transaction: t,
      });

      if (!pagoMercado) {
        // Si falla (ej. webhook de un pago sin haber pasado por el checkout), creamos uno.
        console.warn(
          `Webhook: PagoMercado no encontrado para Transacción ${transaccion.id}. Creando nuevo registro.`
        );
        pagoMercado = await PagoMercado.create(
          {
            id_transaccion: transaccion.id,
            monto_pagado: transaccion.monto,
            metodo_pasarela: metodo,
            estado: internalStatus,
            id_transaccion_pasarela: transactionId,
          },
          { transaction: t }
        );
        await transaccion.update(
          { id_pago: pagoMercado.id },
          { transaction: t }
        );
      } // 4. Actualizar el registro de PagoMercado con la información final de MP

      await pagoMercado.update(
        {
          estado: internalStatus,
          id_transaccion_pasarela:
            transactionId || pagoMercado.id_transaccion_pasarela,
          tipo_medio_pago: paymentDetails?.payment_method_type,
          fecha_aprobacion:
            paymentDetails?.date_approved || pagoMercado.fecha_aprobacion, // Guardar los detalles brutos (rawDetails) es crucial para la auditoría
          detalles_raw: rawDetails,
        },
        { transaction: t }
      ); // 5. Actualizar la Transacción
      await transaccion.update(
        { estado_transaccion: internalStatus },
        { transaction: t }
      ); // 6. Si el pago fue APROBADO, llamar a la LÓGICA DE NEGOCIO CENTRAL

      if (internalStatus === "aprobado") {
        console.log(
          `Webhook: Pago ${transactionId} APROBADO. Ejecutando transaccionService.confirmarTransaccion...`
        ); // Esta función debe hacer el cambio de estado de la Inversión, // actualizar balances, etc.
        await transaccionService.confirmarTransaccion(transaccion.id, {
          transaction: t,
        });
      }

      await t.commit();
      console.log(
        `Webhook de Transacción ${transaccionId} procesado exitosamente.`
      );
    } catch (error) {
      // Manejo de errores de negocio o de base de datos
      try {
        await t.rollback();
      } catch (e) {
        console.error("Error en rollback:", e.message);
      }
      console.error("Error CRÍTICO al procesar webhook:", error.message); // La respuesta 200 OK ya se envió arriba // return res.status(200).send("OK - Error interno.");
    }
  }, // Función para que el frontend pueda consultar el estado de los pagos de una inversión
  async getPaymentStatus(req, res) {
    try {
      const { id_inversion } = req.params;
      const userId = req.user.id; // Se asegura que el usuario sea dueño de la inversión
      const inversion = await Inversion.findOne({
        where: { id: id_inversion, id_usuario: userId },
      });

      if (!inversion) {
        return res
          .status(404)
          .json({ error: "Inversión no encontrada o no te pertenece." });
      }
      const transaccion = await Transaccion.findOne({
        where: { id_inversion: id_inversion, id_usuario: userId },
      });

      if (!transaccion) {
        return res
          .status(404)
          .json({ error: "Transacción no encontrada para esta inversión." });
      } // Busca el último PagoMercado asociado a la Transacción
      const pagoMercado = await PagoMercado.findOne({
        where: { id_transaccion: transaccion.id },
        order: [["createdAt", "DESC"]],
      });
      const pagoDetalle = pagoMercado
        ? {
            transaccionIdPasarela: pagoMercado.id_transaccion_pasarela,
            monto: parseFloat(pagoMercado.monto_pagado),
            estado: pagoMercado.estado,
            metodo: pagoMercado.tipo_medio_pago,
            fecha: pagoMercado.fecha_aprobacion || pagoMercado.createdAt,
          }
        : null;

      res.status(200).json({
        inversionId: inversion.id,
        montoInversion: parseFloat(inversion.monto),
        estadoInversion: inversion.estado,
        transaccionAppId: transaccion.id,
        pagoPasarela: pagoDetalle,
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
};

module.exports = paymentController;
