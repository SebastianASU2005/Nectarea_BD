// controllers/lote.controller.js

const loteService = require('../services/lote.service');

const loteController = {
  // Controlador para crear un nuevo lote
  async create(req, res) {
    try {
      const nuevoLote = await loteService.create(req.body);
      res.status(201).json(nuevoLote);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  // Controlador para obtener todos los lotes
  async findAll(req, res) {
    try {
      const lotes = await loteService.findAll();
      res.status(200).json(lotes);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // Controlador para obtener solo los lotes activos
  async findAllActivo(req, res) {
    try {
      const lotesActivos = await loteService.findAllActivo();
      res.status(200).json(lotesActivos);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // Controlador para encontrar un lote por ID
  async findById(req, res) {
    try {
      const lote = await loteService.findById(req.params.id);
      if (!lote) {
        return res.status(404).json({ error: 'Lote no encontrado' });
      }
      res.status(200).json(lote);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // Controlador para actualizar un lote
  async update(req, res) {
    try {
      const loteActualizado = await loteService.update(req.params.id, req.body);
      if (!loteActualizado) {
        return res.status(404).json({ error: 'Lote no encontrado' });
      }
      res.status(200).json(loteActualizado);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  // Controlador para "eliminar" un lote
  async softDelete(req, res) {
    try {
      const loteEliminado = await loteService.softDelete(req.params.id);
      if (!loteEliminado) {
        return res.status(404).json({ error: 'Lote no encontrado' });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
};

module.exports = loteController;