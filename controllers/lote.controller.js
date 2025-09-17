const loteService = require('../services/lote.service');

const loteController = {
  // Para administradores:
  // Busca un lote por ID (sin importar si está eliminado)
  async findById(req, res) {
    try {
      const lote = await loteService.findById(req.params.id);
      if (!lote) {
        return res.status(404).json({ message: 'Lote no encontrado.' });
      }
      res.json(lote);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // Para usuarios:
  // Busca un lote activo por ID
  async findByIdActivo(req, res) {
    try {
      const lote = await loteService.findByIdActivo(req.params.id);
      if (!lote) {
        return res.status(404).json({ message: 'Lote no encontrado.' });
      }
      res.json(lote);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // El resto de los controladores existentes:
  async create(req, res) {
    try {
      const nuevoLote = await loteService.create(req.body);
      res.status(201).json(nuevoLote);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async findAll(req, res) {
    try {
      const lotes = await loteService.findAll();
      res.json(lotes);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async findAllActivo(req, res) {
    try {
      const lotes = await loteService.findAllActivo();
      res.json(lotes);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async update(req, res) {
    try {
      const loteActualizado = await loteService.update(req.params.id, req.body);
      if (!loteActualizado) {
        return res.status(404).json({ message: 'Lote no encontrado.' });
      }
      res.json(loteActualizado);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async softDelete(req, res) {
    try {
      const loteEliminado = await loteService.softDelete(req.params.id);
      if (!loteEliminado) {
        return res.status(404).json({ message: 'Lote no encontrado.' });
      }
      res.json({ message: 'Lote eliminado lógicamente.' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
};

module.exports = loteController;