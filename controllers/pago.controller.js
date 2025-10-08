const pagoService = require("../services/pago.service");
const transaccionService = require("../services/transaccion.service");

const pagoController = {
  async create(req, res) {
    try {
      const nuevoPago = await pagoService.create(req.body);
      res.status(201).json(nuevoPago);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  async findMyPayments(req, res) {
    try {
      const userId = req.user.id;
      const pagos = await pagoService.findByUserId(userId);
      res.status(200).json(pagos);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  /**
   * FUNCIÓN CLAVE: Llama a la validación y le indica al cliente el siguiente paso (checkout genérico).
   * Su nombre es 'requestCheckout' para evitar el TypeError anterior.
   */
  async requestCheckout(req, res) {
    try {
      const pagoId = req.params.id;
      const userId = req.user.id; // 1. VALIDAR EL PAGO: Se asegura de que el pago exista, pertenezca al usuario y esté pendiente.
      const pagoValidado = await pagoService.getValidPaymentDetails(
        pagoId,
        userId
      ); // 2. GENERAR LA TRANSACCIÓN Y EL CHECKOUT: Llama al servicio genérico //    para crear una Transacción temporal y obtener la URL de la pasarela.

      const { transaccion, redirectUrl } =
        await transaccionService.iniciarTransaccionYCheckout(
          "pago", // El modelo que se está pagando (en este caso, un Pago de mensualidad)
          pagoValidado.id, // El ID del registro de Pago Mensual
          userId // El ID del usuario
        ); // 3. DEVOLVER DIRECTAMENTE LA URL DE REDIRECCIÓN

      res.status(200).json({
        message: `Transacción #${transaccion.id} creada. Redireccionando a la pasarela de pago.`,
        transaccionId: transaccion.id,
        pagoId: pagoValidado.id,
        monto: parseFloat(pagoValidado.monto),
        redirectUrl: redirectUrl, // <-- ¡URL lista para usar!
      });
    } catch (error) {
      const message = error.message;

      if (
        message.includes("Acceso denegado") ||
        message.includes("no encontrado")
      ) {
        return res.status(403).json({ error: message });
      }
      if (message.includes("ya se encuentra en estado")) {
        return res.status(409).json({ error: message });
      }

      res.status(400).json({ error: message });
    }
  },
  async findAll(req, res) {
    try {
      const pagos = await pagoService.findAll();
      res.status(200).json(pagos);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
  async findById(req, res) {
    try {
      const pago = await pagoService.findById(req.params.id);
      if (!pago) {
        return res.status(404).json({ error: "Pago no encontrado." });
      }
      res.status(200).json(pago);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async update(req, res) {
    try {
      const pagoActualizado = await pagoService.update(req.params.id, req.body);
      if (!pagoActualizado) {
        return res.status(404).json({ error: "Pago no encontrado." });
      }
      res.status(200).json(pagoActualizado);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async softDelete(req, res) {
    try {
      const pagoEliminado = await pagoService.softDelete(req.params.id);
      if (!pagoEliminado) {
        return res.status(404).json({ error: "Pago no encontrado." });
      }
      res.status(200).json({ message: "Pago eliminado correctamente." });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async triggerManualPayment(req, res, next) {
    try {
      const { id_suscripcion } = req.body;
      if (!id_suscripcion) {
        return res
          .status(400)
          .json({ message: "El id_suscripcion es requerido." });
      }
      const nuevoPago = await pagoService.generarPagoMensualConDescuento(
        id_suscripcion
      );
      if (nuevoPago.message) {
        return res.status(200).json(nuevoPago);
      }

      res.status(201).json({
        message: "Pago mensual simulado y creado exitosamente.",
        pago: nuevoPago,
      });
    } catch (error) {
      next(error);
    }
  },
};

module.exports = pagoController;
