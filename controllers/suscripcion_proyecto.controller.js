// Archivo: controllers/suscripcion_proyecto.controller.js

// Importaciones de servicios
const suscripcionProyectoService = require("../services/suscripcion_proyecto.service");
const resumenCuentaService = require("../services/resumen_cuenta.service");
const PagoService = require("../services/pago.service");
const TransaccionService = require("../services/transaccion.service");
// 🛑 NUEVAS IMPORTACIONES REQUERIDAS PARA LA LÓGICA 2FA 🛑
const auth2faService = require("../services/auth2fa.service");
const UsuarioService = require("../services/usuario.service");

// Importación de modelos y utilidades
const Proyecto = require("../models/proyecto");
const { sequelize } = require("../config/database");

const suscripcionProyectoController = {
  /**
   * Inicia el proceso de suscripción, creando el pago y la transacción iniciales en estado pendiente.
   * 🚦 MODIFICADO: Aplica el punto de control 2FA.
   */
  async iniciarSuscripcion(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id_proyecto } = req.body;
      const id_usuario = req.user && req.user.id;

      if (!id_usuario) {
        await t.rollback();
        return res
          .status(401)
          .json({
            error: "Usuario no autenticado. Inicia sesión para continuar.",
          });
      }

      if (!id_proyecto) {
        await t.rollback();
        return res
          .status(400)
          .json({ error: "El ID del proyecto es requerido." });
      }

      const [proyecto, user] = await Promise.all([
        Proyecto.findByPk(id_proyecto, { transaction: t }),
        UsuarioService.findById(id_usuario, { transaction: t }),
      ]);

      if (!proyecto) {
        await t.rollback();
        return res.status(404).json({ error: "Proyecto no encontrado." });
      }

      if (proyecto.estado_proyecto === "Finalizado") {
        await t.rollback();
        return res
          .status(400)
          .json({
            error:
              "No se puede suscribir a un proyecto que ya ha sido finalizado.",
          });
      }

      const monto = parseFloat(proyecto.monto_inversion);

      // 🛑 PUNTO DE CONTROL DE SEGURIDAD 2FA (Modificación) 🛑
      // Si el 2FA está activo, creamos los registros pero detenemos la generación de la URL de pago.
      if (user && user.is_2fa_enabled) {
        // 1. Crear Pago y Transacción Pendientes
        const pagoPendiente = await PagoService.create(
          {
            id_suscripcion: null,
            id_usuario,
            id_proyecto,
            monto,
            fecha_vencimiento: new Date(),
            estado_pago: "pendiente",
            mes: 1,
          },
          { transaction: t }
        );

        const transaccionPendiente = await TransaccionService.create(
          {
            tipo_transaccion: "pago_suscripcion_inicial",
            monto,
            id_usuario,
            id_proyecto,
            id_pago_mensual: pagoPendiente.id,
            estado_transaccion: "pendiente",
          },
          { transaction: t }
        );

        await t.commit(); // Confirmamos los registros pendientes

        // Devolvemos 202 para indicarle al frontend que necesita el 2FA
        return res.status(202).json({
          message:
            "Suscripción iniciada, se requiere verificación 2FA para generar el checkout.",
          is2FARequired: true,
          transaccionId: transaccionPendiente.id,
          pagoId: pagoPendiente.id,
        });
      }

      // ---------------------------------------------------------------------------------------
      // FLUJO NORMAL (Si 2FA no está activo) - Procede directamente a la pasarela
      // ---------------------------------------------------------------------------------------

      // 1. Crear Pago y Transacción Pendientes
      const pagoPendiente = await PagoService.create(
        {
          id_suscripcion: null,
          id_usuario,
          id_proyecto,
          monto,
          fecha_vencimiento: new Date(),
          estado_pago: "pendiente",
          mes: 1,
        },
        { transaction: t }
      );

      let transaccionPendiente = await TransaccionService.create(
        {
          tipo_transaccion: "pago_suscripcion_inicial",
          monto,
          id_usuario,
          id_proyecto,
          id_pago_mensual: pagoPendiente.id,
          estado_transaccion: "pendiente",
        },
        { transaction: t }
      ); // 2. Generar la URL de redirección

      const { redirectUrl } =
        await TransaccionService.generarCheckoutParaTransaccionExistente(
          transaccionPendiente,
          "mercadopago",
          { transaction: t }
        );

      await t.commit();

      res.status(200).json({
        message: "Transacción creada. Redireccionando a la pasarela de pago.",
        transaccionId: transaccionPendiente.id,
        pagoId: pagoPendiente.id,
        redirectUrl: redirectUrl,
      });
    } catch (error) {
      await t.rollback();
      console.error("Error al iniciar suscripción/pago:", error.message);
      res.status(500).json({ error: error.message });
    }
  },

  /**
   * 🚀 NUEVO: Verifica el código 2FA para una suscripción/pago pendiente
   * y, si es correcto, genera la URL de redirección a la pasarela.
   */
  async confirmarSuscripcionCon2FA(req, res) {
    const t = await sequelize.transaction();
    try {
      const userId = req.user.id;
      // Esperamos el ID de la transacción y el código 2FA
      const { transaccionId, codigo_2fa } = req.body;

      // 1. Validar Transacción y Usuario
      const [user, transaccionPendiente] = await Promise.all([
        UsuarioService.findById(userId, { transaction: t }),
        TransaccionService.findById(transaccionId, { transaction: t }),
      ]);

      if (
        !user ||
        !transaccionPendiente ||
        transaccionPendiente.id_usuario !== userId ||
        transaccionPendiente.estado_transaccion !== "pendiente"
      ) {
        await t.rollback();
        return res
          .status(403)
          .json({
            error: "Transacción no válida, no pendiente o no te pertenece.",
          });
      }

      // 2. VERIFICACIÓN CRÍTICA DEL 2FA
      if (!user.is_2fa_enabled || !user.twofa_secret) {
        await t.rollback();
        return res
          .status(403)
          .json({ error: "2FA no activo. Error de flujo." });
      }

      const isVerified = auth2faService.verifyToken(
        user.twofa_secret,
        codigo_2fa
      );

      if (!isVerified) {
        await t.rollback();
        return res
          .status(401)
          .json({ error: "Código 2FA incorrecto. Transacción rechazada." });
      }

      // 3. EJECUTAR LA LÓGICA DE PASARELA (Solo si el 2FA es correcto)
      const { redirectUrl } =
        await TransaccionService.generarCheckoutParaTransaccionExistente(
          transaccionPendiente,
          "mercadopago",
          { transaction: t }
        );

      await t.commit();

      // 4. Respuesta de Éxito: Devolver la URL de redirección
      res.status(200).json({
        message: `Verificación 2FA exitosa. Redireccionando a la pasarela.`,
        redirectUrl: redirectUrl,
      });
    } catch (error) {
      await t.rollback();
      res.status(400).json({ error: error.message });
    }
  },

  /**
   * Endpoint del webhook para confirmar un pago procesado por la pasarela de pago.
   */ async confirmarSuscripcion(req, res) {
    try {
      const { transaccionId } = req.body;

      if (!transaccionId) {
        return res
          .status(400)
          .json({ error: "El ID de la transacción es requerido." });
      }

      await suscripcionProyectoService.confirmarSuscripcion(transaccionId);

      res
        .status(200)
        .json({ message: "Suscripción confirmada y creada exitosamente." });
    } catch (error) {
      console.error("Error al confirmar la suscripción:", error);
      res.status(500).json({ error: error.message });
    }
  }, // ... (El resto de las funciones del controlador: findMySubscriptions, findAll, etc. se mantienen igual) ...
  async findMySubscriptions(req, res) {
    try {
      const userId = req.user.id;
      const suscripciones = await suscripcionProyectoService.findByUserId(
        userId
      );
      res.status(200).json(suscripciones);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
  async findAll(req, res) {
    try {
      const suscripciones = await suscripcionProyectoService.findAll();
      res.status(200).json(suscripciones);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
  async findAllActivo(req, res) {
    try {
      const suscripciones = await suscripcionProyectoService.findAllActivo();
      res.status(200).json(suscripciones);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
  async findById(req, res) {
    try {
      const suscripcion = await suscripcionProyectoService.findById(
        req.params.id
      );
      if (!suscripcion) {
        return res.status(404).json({ error: "Suscripción no encontrada" });
      }
      res.status(200).json(suscripcion);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
  async findMySubscriptionById(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      const suscripcion = await suscripcionProyectoService.findByIdAndUserId(
        id,
        userId
      );
      if (!suscripcion) {
        return res
          .status(404)
          .json({ error: "Suscripción no encontrada o no te pertenece." });
      }
      res.status(200).json(suscripcion);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
  async softDeleteMySubscription(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      const suscripcion = await suscripcionProyectoService.findByIdAndUserId(
        id,
        userId
      );
      if (!suscripcion) {
        return res
          .status(404)
          .json({ error: "Suscripción no encontrada o no te pertenece." });
      }
      const suscripcionCancelada = await suscripcionProyectoService.softDelete(
        id
      );
      res.status(200).json({
        message: "Suscripción cancelada correctamente.",
        suscripcion: suscripcionCancelada,
      });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },
  async softDelete(req, res) {
    try {
      const suscripcionEliminada = await suscripcionProyectoService.softDelete(
        req.params.id
      );
      if (!suscripcionEliminada) {
        return res.status(404).json({ error: "Suscripción no encontrada" });
      }
      res.status(200).json({ message: "Suscripción eliminada correctamente." });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
};

module.exports = suscripcionProyectoController;
