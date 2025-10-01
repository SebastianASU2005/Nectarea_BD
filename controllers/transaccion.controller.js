const transaccionService = require('../services/transaccion.service');

const transaccionController = {
  // Controlador para crear una nueva transacción
  async create(req, res) {
    try {
      const id_usuario = req.user.id;
      const nuevaTransaccion = await transaccionService.create({ ...req.body, id_usuario });
      res.status(201).json(nuevaTransaccion);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  // Controlador para obtener todas las transacciones (versión para administradores)
  async findAll(req, res) {
    try {
      const transacciones = await transaccionService.findAll();
      res.status(200).json(transacciones);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // **NUEVO** - Obtiene las transacciones del usuario autenticado
  async findMyTransactions(req, res) {
    try {
      const userId = req.user.id;
      const transacciones = await transaccionService.findByUserId(userId);
      res.status(200).json(transacciones);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // **NUEVO** - Controlador para la confirmación de la transacción (manual o por webhook)
  async confirmarTransaccion(req, res) {
    try {
      const { id } = req.params;
      const { estado } = req.body;
      const transaccion = await transaccionService.confirmarTransaccion(id, estado);
      res.status(200).json({ mensaje: "Transacción y datos asociados actualizados con éxito", transaccion });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  // ... (El resto de tus funciones de controlador) ...
  async findAllActivo(req, res) {
    try {
      const transaccionesActivas = await transaccionService.findAllActivo();
      res.status(200).json(transaccionesActivas);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
  async findById(req, res) {
    try {
      const transaccion = await transaccionService.findById(req.params.id);
      if (!transaccion) {
        return res.status(404).json({ error: 'Transacción no encontrada' });
      }
      res.status(200).json(transaccion);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
  async findMyTransactionById(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      const transaccion = await transaccionService.findByIdAndUserId(id, userId);
      if (!transaccion) {
        return res.status(404).json({ error: 'Transacción no encontrada o no te pertenece.' });
      }
      res.status(200).json(transaccion);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
  async update(req, res) {
    try {
      const transaccionActualizada = await transaccionService.update(req.params.id, req.body);
      if (!transaccionActualizada) {
        return res.status(404).json({ error: 'Transacción no encontrada' });
      }
      res.status(200).json(transaccionActualizada);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },
  async updateMyTransaction(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      const transaccionActualizada = await transaccionService.updateByIdAndUserId(id, userId, req.body);
      if (!transaccionActualizada) {
        return res.status(404).json({ error: "Transacción no encontrada o no te pertenece." });
      }
      res.status(200).json(transaccionActualizada);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },
  async softDelete(req, res) {
    try {
      const transaccionEliminada = await transaccionService.softDelete(req.params.id);
      if (!transaccionEliminada) {
        return res.status(404).json({ error: 'Transacción no encontrada' });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
  async softDeleteMyTransaction(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      const transaccionEliminada = await transaccionService.softDeleteByIdAndUserId(id, userId);
      if (!transaccionEliminada) {
        return res.status(404).json({ error: "Transacción no encontrada o no te pertenece." });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
};

module.exports = transaccionController;
