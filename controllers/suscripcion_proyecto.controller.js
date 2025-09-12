const suscripcionProyectoService = require('../services/suscripcion_proyecto.service');

const suscripcionProyectoController = {
  // Controlador para crear una nueva suscripción
  async create(req, res) {
    try {
      const nuevaSuscripcion = await suscripcionProyectoService.create(req.body);
      res.status(201).json(nuevaSuscripcion);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  // Controlador para obtener todas las suscripciones
  async findAll(req, res) {
    try {
      const suscripciones = await suscripcionProyectoService.findAll();
      res.status(200).json(suscripciones);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // Controlador para obtener todas las suscripciones activas
  async findAllActivo(req, res) {
    try {
      const suscripciones = await suscripcionProyectoService.findAllActivo();
      res.status(200).json(suscripciones);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // Controlador para obtener una suscripción por su ID
  async findById(req, res) {
    try {
      const suscripcion = await suscripcionProyectoService.findById(req.params.id);
      if (!suscripcion) {
        return res.status(404).json({ error: 'Suscripción no encontrada' });
      }
      res.status(200).json(suscripcion);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // Controlador para eliminar (soft delete) una suscripción
  async softDelete(req, res) {
    try {
      const suscripcionEliminada = await suscripcionProyectoService.softDelete(req.params.id);
      if (!suscripcionEliminada) {
        return res.status(404).json({ error: 'Suscripción no encontrada' });
      }
      res.status(200).json({ message: 'Suscripción eliminada correctamente.' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
};

module.exports = suscripcionProyectoController;