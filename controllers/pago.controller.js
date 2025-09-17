const pagoService = require('../services/pago.service');

const pagoController = {
  // **NUEVA FUNCIÓN**: Crea un nuevo pago
  async create(req, res) {
    try {
      const nuevoPago = await pagoService.create(req.body);
      res.status(201).json(nuevoPago);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  // Obtiene todos los pagos (para administradores)
  async findAll(req, res) {
    try {
      const pagos = await pagoService.findAll();
      res.status(200).json(pagos);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // Obtiene un pago por su ID (para administradores)
  async findById(req, res) {
    try {
      const pago = await pagoService.findById(req.params.id);
      if (!pago) {
        return res.status(404).json({ error: 'Pago no encontrado.' });
      }
      res.status(200).json(pago);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // **NUEVA FUNCIÓN**: Obtiene los pagos del usuario autenticado de forma segura
  async findMyPayments(req, res) {
    try {
      // El ID del usuario se obtiene de forma segura del token de autenticación
      const userId = req.user.id;
      const pagos = await pagoService.findByUserId(userId);
      res.status(200).json(pagos);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // Confirma un pago (simula la acción de una pasarela de pago)
  async confirmPayment(req, res) {
    try {
      const pagoConfirmado = await pagoService.markAsPaid(req.params.id);
      res.status(200).json({
        message: 'Pago confirmado y correo de notificación enviado.',
        pago: pagoConfirmado
      });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  // Agregado: Actualiza un pago
  async update(req, res) {
    try {
      const pagoActualizado = await pagoService.update(req.params.id, req.body);
      if (!pagoActualizado) {
        return res.status(404).json({ error: 'Pago no encontrado.' });
      }
      res.status(200).json(pagoActualizado);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // Agregado: "Elimina" un pago (soft delete)
  async softDelete(req, res) {
    try {
      const pagoEliminado = await pagoService.softDelete(req.params.id);
      if (!pagoEliminado) {
        return res.status(404).json({ error: 'Pago no encontrado.' });
      }
      res.status(200).json({ message: 'Pago eliminado correctamente.' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
};

module.exports = pagoController;