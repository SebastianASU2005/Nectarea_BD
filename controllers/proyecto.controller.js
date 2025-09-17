const proyectoService = require('../services/proyecto.service');
const loteService = require('../services/lote.service');
const usuarioService = require('../services/usuario.service');
const mensajeService = require('../services/mensaje.service');
const { sequelize } = require('../config/database');
const { validate } = require('uuid');
const SuscripcionProyectoService = require('../services/suscripcion_proyecto.service');

const proyectoController = {
  // Obtiene todos los proyectos (para admin)
  async findAll(req, res) {
    try {
      const proyectos = await proyectoService.findAll();
      res.status(200).json(proyectos);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // Obtiene un proyecto por su ID (para admin)
  async findById(req, res) {
    try {
      const { id } = req.params;
      const proyecto = await proyectoService.findById(id);
      if (!proyecto) {
        return res.status(404).json({ error: 'Proyecto no encontrado.' });
      }
      res.status(200).json(proyecto);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // Crea un nuevo proyecto y notifica a todos los usuarios
  async create(req, res) {
    const t = await sequelize.transaction();
    try {
      // 1. Crea el proyecto
      const { lotesIds, ...proyectoData } = req.body;
      const nuevoProyecto = await proyectoService.create(proyectoData, { transaction: t });

      // 2. Asocia los lotes al proyecto si se proporcionan
      if (lotesIds && lotesIds.length > 0) {
        await loteService.updateLotesProyecto(lotesIds, nuevoProyecto.id, t);
      }
      
      // 3. Envía un mensaje a todos los usuarios
      const todosLosUsuarios = await usuarioService.findAllActivos();
      
      const remitente_id = 1; // ID de un usuario del sistema (ej. el administrador)
      const tipoInversion = req.body.tipo_inversion || 'Inversión'; 
      const contenido = `Se ha añadido un nuevo proyecto en la sección de ${tipoInversion}. ¡Revisa el proyecto "${nuevoProyecto.nombre_proyecto}"!`;

      for (const usuario of todosLosUsuarios) {
        if (usuario.id !== remitente_id) {
          await mensajeService.crear({
            id_remitente: remitente_id,
            id_receptor: usuario.id,
            contenido: contenido
          }, { transaction: t });
        }
      }

      await t.commit();
      res.status(201).json(nuevoProyecto);
    } catch (error) {
      await t.rollback();
      res.status(400).json({ error: error.message });
    }
  },

  // Actualiza un proyecto
  async update(req, res) {
    try {
      const { id } = req.params;
      const proyectoActualizado = await proyectoService.update(id, req.body);
      if (!proyectoActualizado) {
        return res.status(404).json({ error: 'Proyecto no encontrado.' });
      }
      res.status(200).json(proyectoActualizado);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  // "Elimina" un proyecto (soft delete)
  async softDelete(req, res) {
    try {
      const { id } = req.params;
      const proyectoEliminado = await proyectoService.softDelete(id);
      if (!proyectoEliminado) {
        return res.status(404).json({ error: 'Proyecto no encontrado.' });
      }
      res.status(200).json({ mensaje: 'Proyecto eliminado exitosamente.' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // Obtiene todos los proyectos activos (para usuarios)
  async findAllActivo(req, res) {
    try {
      const proyectos = await proyectoService.findAllActivo();
      res.status(200).json(proyectos);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // Obtiene un proyecto activo por su ID (para usuarios)
  async findByIdActivo(req, res) {
    try {
      const { id } = req.params;
      const proyecto = await proyectoService.findByIdActivo(id);
      if (!proyecto) {
        return res.status(404).json({ error: 'Proyecto no encontrado o no está activo.' });
      }
      res.status(200).json(proyecto);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // Obtiene los proyectos en los que el usuario está suscrito
  async findMyProjects(req, res) {
    try {
      const userId = req.user.id;
      const proyectos = await SuscripcionProyectoService.findProjectsByUserId(userId);
      res.status(200).json(proyectos);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
};

module.exports = proyectoController;