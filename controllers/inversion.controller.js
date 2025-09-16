const inversionService = require('../services/inversion.service');

const inversionController = {
  async create(req, res) {
    try {
      // Tomamos el ID del inversor del token para evitar falsificación
      const id_inversor = req.user.id;
      const data = { ...req.body, id_inversor };
      const nuevaInversion = await inversionService.create(data);
      res.status(201).json(nuevaInversion);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  // **NUEVA FUNCIÓN**: Obtiene las inversiones asociadas al usuario autenticado
  async findMyInversions(req, res) {
    try {
      const userId = req.user.id; // ¡Obtenemos el ID del usuario desde el JWT!
      const inversiones = await inversionService.findByUserId(userId);
      res.status(200).json(inversiones);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async findAll(req, res) {
    try {
      const inversiones = await inversionService.findAll();
      res.status(200).json(inversiones);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async findAllActivo(req, res) {
    try {
      const inversiones = await inversionService.findAllActivo();
      res.status(200).json(inversiones);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async findById(req, res) {
    try {
      const { id } = req.params;
      const inversion = await inversionService.findById(id);
      if (!inversion) {
        return res.status(404).json({ message: 'Inversión no encontrada' });
      }
      res.status(200).json(inversion);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async update(req, res) {
    try {
      const { id } = req.params;
      const inversionActualizada = await inversionService.update(id, req.body);
      if (!inversionActualizada) {
        return res.status(404).json({ message: 'Inversión no encontrada' });
      }
      res.status(200).json(inversionActualizada);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  async softDelete(req, res) {
    try {
      const { id } = req.params;
      const inversionEliminada = await inversionService.softDelete(id);
      if (!inversionEliminada) {
        return res.status(404).json({ message: 'Inversión no encontrada' });
      }
      res.status(204).send(); // No Content
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
};

module.exports = inversionController;