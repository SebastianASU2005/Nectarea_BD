// controllers/transaccion.controller.js

const transaccionService = require('../services/transaccion.service');

const transaccionController = {
  // Controlador para crear una nueva transacción
  async create(req, res) {
    try {
      const nuevaTransaccion = await transaccionService.create(req.body);
      res.status(201).json(nuevaTransaccion);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  // Controlador para obtener todas las transacciones
  async findAll(req, res) {
    try {
      const transacciones = await transaccionService.findAll();
      res.status(200).json(transacciones);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // Controlador para obtener solo las transacciones activas
  async findAllActivo(req, res) {
    try {
      const transaccionesActivas = await transaccionService.findAllActivo();
      res.status(200).json(transaccionesActivas);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // Controlador para encontrar una transacción por ID
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

  // Controlador para actualizar una transacción
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

  // Controlador para "eliminar" una transacción
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
  }
};

module.exports = transaccionController;