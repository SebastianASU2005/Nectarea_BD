// controllers/imagen.controller.js

const imagenService = require('../services/imagen.service');

const imagenController = {
  // Controlador para crear una nueva imagen
  async create(req, res) {
    try {
      const nuevaImagen = await imagenService.create(req.body);
      res.status(201).json(nuevaImagen);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  // Controlador para obtener todas las imágenes
  async findAll(req, res) {
    try {
      const imagenes = await imagenService.findAll();
      res.status(200).json(imagenes);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // Controlador para obtener solo las imágenes activas
  async findAllActivo(req, res) {
    try {
      const imagenesActivas = await imagenService.findAllActivo();
      res.status(200).json(imagenesActivas);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // Controlador para encontrar una imagen por ID
  async findById(req, res) {
    try {
      const imagen = await imagenService.findById(req.params.id);
      if (!imagen) {
        return res.status(404).json({ error: 'Imagen no encontrada' });
      }
      res.status(200).json(imagen);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // Controlador para actualizar una imagen
  async update(req, res) {
    try {
      const imagenActualizada = await imagenService.update(req.params.id, req.body);
      if (!imagenActualizada) {
        return res.status(404).json({ error: 'Imagen no encontrada' });
      }
      res.status(200).json(imagenActualizada);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  // Controlador para "eliminar" una imagen
  async softDelete(req, res) {
    try {
      const imagenEliminada = await imagenService.softDelete(req.params.id);
      if (!imagenEliminada) {
        return res.status(404).json({ error: 'Imagen no encontrada' });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
};

module.exports = imagenController;