const pagoService = require("../services/pago.service");

const pagoController = {
  /**
   * Crea un nuevo registro de pago inicial.
   */
  async create(req, res) {
    try {
      // Lógica de creación de pago inicial...
      const nuevoPago = await pagoService.create(req.body);
      res.status(201).json(nuevoPago);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  /**
   * Obtiene los pagos del usuario autenticado de forma segura.
   */
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
   * **NUEVA FUNCIÓN**
   * @route POST /pagar-mes/:id
   * Procesa la solicitud de pago para un pago pendiente o vencido.
   * Crea la Transacción y la confirma.
   */
  async processPayment(req, res) {
    try {
      const pagoId = req.params.id; // ID del pago a procesar
      const userId = req.user.id;   // ID del usuario autenticado
      
      // La capa de servicio se encarga de todo el flujo de validación y confirmación.
      const resultado = await pagoService.processPaymentCreation(pagoId, userId);
      
      res.status(200).json({
        message: `Pago ID ${pagoId} procesado y confirmado exitosamente.`,
        transaccion_confirmada: resultado.transaccion,
        pago_actualizado: resultado.pago,
      });

    } catch (error) {
      const message = error.message;

      // Manejo de errores específicos (ya pagado, acceso denegado, etc.)
      if (message.includes("Acceso denegado") || message.includes("no encontrado")) {
           return res.status(403).json({ error: message }); 
      }
      if (message.includes("ya se encuentra en estado")) {
           return res.status(409).json({ error: message }); 
      }

      // 400 Bad Request para errores de lógica de negocio o validación
      res.status(400).json({ error: message });
    }
  },

  // =================================================================
  // FUNCIONES DE ADMINISTRADOR (Mantenidas por consistencia)
  // =================================================================

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
        return res.status(400).json({ message: "El id_suscripcion es requerido." });
      }
      const nuevoPago = await pagoService.generarPagoMensualConDescuento(id_suscripcion);
      
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
