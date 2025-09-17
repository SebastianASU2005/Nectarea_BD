const proyectoService = require('../services/proyecto.service');

const proyectoController = {
  // Para administradores:
  // Busca un proyecto por ID (sin importar si está eliminado)
  async findById(req, res) {
    try {
      const proyecto = await proyectoService.findById(req.params.id);
      if (!proyecto) {
        return res.status(404).json({ message: 'Proyecto no encontrado.' });
      }
      res.json(proyecto);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // Para usuarios:
  // Busca un proyecto activo por ID
  async findByIdActivo(req, res) {
    try {
      const proyecto = await proyectoService.findByIdActivo(req.params.id);
      if (!proyecto) {
        return res.status(404).json({ message: 'Proyecto no encontrado.' });
      }
      res.json(proyecto);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // El resto de los controladores existentes:
  async create(req, res) {
    try {
      const { projectData, lotesIds } = req.body;
      const nuevoProyecto = await proyectoService.create(projectData, lotesIds);
      res.status(201).json(nuevoProyecto);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async findAll(req, res) {
    try {
      const proyectos = await proyectoService.findAll();
      res.json(proyectos);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async findAllActivo(req, res) {
    try {
      const proyectos = await proyectoService.findAllActivo();
      res.json(proyectos);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async findMyProjects(req, res) {
    try {
      const proyectos = await proyectoService.findByUserId(req.usuario.id);
      res.json(proyectos);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async update(req, res) {
    try {
      const proyectoActualizado = await proyectoService.update(req.params.id, req.body);
      if (!proyectoActualizado) {
        return res.status(404).json({ message: 'Proyecto no encontrado.' });
      }
      res.json(proyectoActualizado);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async softDelete(req, res) {
    try {
      const proyectoEliminado = await proyectoService.softDelete(req.params.id);
      if (!proyectoEliminado) {
        return res.status(404).json({ message: 'Proyecto no encontrado.' });
      }
      res.json({ message: 'Proyecto eliminado lógicamente.' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
};

module.exports = proyectoController;