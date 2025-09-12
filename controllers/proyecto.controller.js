const proyectoService = require("../services/proyecto.service");

const proyectoController = {
  async create(req, res) {
    try {
      // Separa los datos del proyecto y los IDs de los lotes
      const { lotesIds, ...projectData } = req.body;
      const nuevoProyecto = await proyectoService.create(projectData, lotesIds);
      res.status(201).json(nuevoProyecto);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  async findAll(req, res) {
    try {
      const proyectos = await proyectoService.findAll();
      res.status(200).json(proyectos);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async findAllActivo(req, res) {
    try {
      const proyectosActivos = await proyectoService.findAllActivo();
      res.status(200).json(proyectosActivos);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async findById(req, res) {
    try {
      const proyecto = await proyectoService.findById(req.params.id);
      if (!proyecto) {
        return res.status(404).json({ error: "Proyecto no encontrado" });
      }
      res.status(200).json(proyecto);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async update(req, res) {
    try {
      const proyectoActualizado = await proyectoService.update(
        req.params.id,
        req.body
      );
      if (!proyectoActualizado) {
        return res.status(404).json({ error: "Proyecto no encontrado" });
      }
      res.status(200).json(proyectoActualizado);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  async softDelete(req, res) {
    try {
      const proyectoEliminado = await proyectoService.softDelete(req.params.id);
      if (!proyectoEliminado) {
        return res.status(404).json({ error: "Proyecto no encontrado" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
};

module.exports = proyectoController;
