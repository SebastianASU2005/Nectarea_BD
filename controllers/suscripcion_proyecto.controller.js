// Importaciones de servicios y modelos
const suscripcionProyectoService = require("../services/suscripcion_proyecto.service");
const resumenCuentaService = require("../services/resumen_cuenta.service");
const PagoService = require("../services/pago.service");
const TransaccionService = require("../services/transaccion.service");
const Proyecto = require("../models/proyecto");
const { sequelize } = require("../config/database");
// El resto de importaciones (express, router, middleware) se asumen en el archivo principal

const suscripcionProyectoController = {
  /**
   * Inicia el proceso de suscripción, creando el pago y la transacción iniciales en estado pendiente.
   * @param {Object} req - Objeto de la solicitud HTTP.
   * @param {Object} res - Objeto de la respuesta HTTP.
   */
  async iniciarSuscripcion(req, res) {
    const t = await sequelize.transaction();
    try {
      const { id_proyecto } = req.body;
      const id_usuario = req.user && req.user.id; // 🚨 AGREGADO: Validación para asegurar que el usuario está autenticado

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

      const proyecto = await Proyecto.findByPk(id_proyecto, { transaction: t });

      if (!proyecto) {
        await t.rollback();
        return res.status(404).json({ error: "Proyecto no encontrado." });
      }

      if (proyecto.estado_proyecto === "Finalizado") {
        await t.rollback();
        return res.status(400).json({
          error:
            "No se puede suscribir a un proyecto que ya ha sido finalizado.",
        });
      }

      const monto = parseFloat(proyecto.monto_inversion); // 1. Crear un registro de Pago con estado 'pendiente' // ✅ CORRECCIÓN CLAVE: Almacenar id_usuario e id_proyecto directamente en Pago

      const pagoPendiente = await PagoService.create(
        {
          id_suscripcion: null,
          id_usuario: id_usuario, // 👈 AGREGADO
          id_proyecto: id_proyecto, // 👈 AGREGADO
          monto: monto, // Nota: La fecha de vencimiento es incorrecta aquí, pero se corregirá en el service
          fecha_vencimiento: new Date(),
          estado_pago: "pendiente",
          mes: 1,
        },
        { transaction: t }
      ); // 2. Crear un registro de Transacción con estado 'pendiente'

      const transaccionPendiente = await TransaccionService.create(
        {
          tipo_transaccion: "pago_suscripcion_inicial",
          monto: monto,
          id_usuario,
          id_proyecto,
          id_pago: pagoPendiente.id,
          estado_transaccion: "pendiente",
        },
        { transaction: t }
      );

      await t.commit();

      res.status(202).json({
        message:
          "Proceso de pago iniciado. Transacción y pago creados en estado pendiente.",
        transaccionId: transaccionPendiente.id,
        pagoId: pagoPendiente.id,
      });
    } catch (error) {
      await t.rollback();
      res.status(500).json({ error: error.message });
    }
  }
  /**
   * Endpoint del webhook para confirmar un pago procesado por la pasarela de pago.
   * @param {Object} req - Objeto de la solicitud HTTP.
   * @param {Object} res - Objeto de la respuesta HTTP.
   */,

  async confirmarSuscripcion(req, res) {
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
  },
  // ... el resto de las funciones del controlador ...
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
  // ...
  async findAll(req, res) {
    try {
      const suscripciones = await suscripcionProyectoService.findAll();
      res.status(200).json(suscripciones);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
  // ...
  async findAllActivo(req, res) {
    try {
      const suscripciones = await suscripcionProyectoService.findAllActivo();
      res.status(200).json(suscripciones);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
  // ...
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
  // ...
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
  // ...
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
  // ...
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
