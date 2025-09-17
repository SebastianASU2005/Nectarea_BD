const suscripcionProyectoService = require('../services/suscripcion_proyecto.service');

const suscripcionProyectoController = {
  async create(req, res) {
    try {
      const id_usuario = req.user.id;
      const data = { ...req.body, id_usuario };
      const nuevaSuscripcion = await suscripcionProyectoService.create(data);
      res.status(201).json(nuevaSuscripcion);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  async findMySubscriptions(req, res) {
    try {
      const userId = req.user.id;
      const suscripciones = await suscripcionProyectoService.findByUserId(userId);
      res.status(200).json(suscripciones);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async findAll(req, res) {
    try {
      const suscripciones = await suscripcionProyectoService.findAll();
      res.status(200).json(suscripciones);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async findAllActivo(req, res) {
    try {
      const suscripciones = await suscripcionProyectoService.findAllActivo();
      res.status(200).json(suscripciones);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

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

  async findMySubscriptionById(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      const suscripcion = await suscripcionProyectoService.findByIdAndUserId(id, userId);
      if (!suscripcion) {
        return res.status(404).json({ error: 'Suscripción no encontrada o no te pertenece.' });
      }
      res.status(200).json(suscripcion);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async softDeleteMySubscription(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      const suscripcion = await suscripcionProyectoService.findByIdAndUserId(id, userId);
      if (!suscripcion) {
        return res.status(404).json({ error: 'Suscripción no encontrada o no te pertenece.' });
      }
      const suscripcionCancelada = await suscripcionProyectoService.softDelete(id);
      res.status(200).json({ message: 'Suscripción cancelada correctamente.', suscripcion: suscripcionCancelada });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

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