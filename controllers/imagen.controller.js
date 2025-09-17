const imagenService = require('../services/imagen.service');

const imagenController = {
  // Para administradores:
  // Busca una imagen por ID (sin importar si está eliminada)
  async findById(req, res) {
    try {
      const imagen = await imagenService.findById(req.params.id);
      if (!imagen) {
        return res.status(404).json({ message: 'Imagen no encontrada.' });
      }
      res.json(imagen);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // Para usuarios:
  // Busca una imagen activa por ID
  async findByIdActivo(req, res) {
    try {
      const imagen = await imagenService.findByIdActivo(req.params.id);
      if (!imagen) {
        return res.status(404).json({ message: 'Imagen no encontrada.' });
      }
      res.json(imagen);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // El resto de los controladores existentes:
  async create(req, res) {
    try {
      const nuevaImagen = await imagenService.create(req.body);
      res.status(201).json(nuevaImagen);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async findAll(req, res) {
    try {
      const imagenes = await imagenService.findAll();
      res.json(imagenes);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async findAllActivo(req, res) {
    try {
      const imagenes = await imagenService.findAllActivo();
      res.json(imagenes);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async update(req, res) {
    try {
      const imagenActualizada = await imagenService.update(req.params.id, req.body);
      if (!imagenActualizada) {
        return res.status(404).json({ message: 'Imagen no encontrada.' });
      }
      res.json(imagenActualizada);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async softDelete(req, res) {
    try {
      const imagenEliminada = await imagenService.softDelete(req.params.id);
      if (!imagenEliminada) {
        return res.status(404).json({ message: 'Imagen no encontrada.' });
      }
      res.json({ message: 'Imagen eliminada lógicamente.' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
};

module.exports = imagenController;