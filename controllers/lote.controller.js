const loteService = require('../services/lote.service');
const proyectoService = require('../services/proyecto.service');
const pujaService = require('../services/puja.service');
const mensajeService = require('../services/mensaje.service');
const SuscripcionProyectoService = require('../services/suscripcion_proyecto.service');

const loteController = {
  // Obtiene todos los lotes
  async findAll(req, res) {
    try {
      const lotes = await loteService.findAll();
      res.status(200).json(lotes);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // Obtiene un lote por su ID
  async findById(req, res) {
    try {
      const { id } = req.params;
      const lote = await loteService.findById(id);
      if (!lote) {
        return res.status(404).json({ error: 'Lote no encontrado.' });
      }
      res.status(200).json(lote);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // Crea un nuevo lote.
  async create(req, res) {
    try {
      const nuevoLote = await loteService.create(req.body);
      res.status(201).json(nuevoLote);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  // Actualiza un lote
  async update(req, res) {
    try {
      const { id } = req.params;
      const loteActualizado = await loteService.update(id, req.body);
      if (!loteActualizado) {
        return res.status(404).json({ error: 'Lote no encontrado.' });
      }
      res.status(200).json(loteActualizado);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  // "Elimina" un lote (soft delete)
  async softDelete(req, res) {
    try {
      const { id } = req.params;
      const loteEliminado = await loteService.softDelete(id);
      if (!loteEliminado) {
        return res.status(404).json({ error: 'Lote no encontrado.' });
      }
      res.status(200).json({ mensaje: 'Lote eliminado exitosamente.' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // Inicia la subasta de un lote y notifica a los usuarios
  async startAuction(req, res) {
    try {
      const { id } = req.params;
      const lote = await loteService.findById(id);
      if (!lote) {
        return res.status(404).json({ error: 'Lote no encontrado.' });
      }
      const proyecto = await proyectoService.findById(lote.id_proyecto);
      if (!proyecto) {
        return res.status(404).json({ error: 'Proyecto asociado no encontrado.' });
      }

      await loteService.update(id, { estado_subasta: 'activa', fecha_inicio: new Date() });

      // Obtener usuarios suscritos al proyecto
      const suscriptores = await SuscripcionProyectoService.findUsersByProjectId(proyecto.id);

      const remitente_id = 1; // ID de un usuario del sistema (ej. administrador)
      const contenido = `¡La subasta del lote "${lote.nombre_lote}" del proyecto "${proyecto.nombre_proyecto}" ha comenzado!`;

      // Enviar mensaje a cada suscriptor
      for (const suscriptor of suscriptores) {
        await mensajeService.crear({
          id_remitente: remitente_id,
          id_receptor: suscriptor.id,
          contenido: contenido
        });
      }

      res.status(200).json({ mensaje: 'Subasta iniciada y notificaciones enviadas.' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // Finaliza la subasta de un lote, asigna un ganador y notifica
  async endAuction(req, res) {
    try {
      const { id } = req.params;
      const lote = await loteService.findById(id);
      if (!lote) {
        return res.status(404).json({ error: 'Lote no encontrado.' });
      }

      if (lote.estado_subasta !== 'activa') {
        return res.status(400).json({ error: 'La subasta no está activa.' });
      }

      const pujaGanadora = await pujaService.findHighestBidForLote(id);
      let mensaje;

      if (pujaGanadora) {
        await loteService.update(id, { estado_subasta: 'finalizada', fecha_fin: new Date(), id_ganador: pujaGanadora.id_usuario });
        mensaje = `¡Felicitaciones! Has ganado la subasta del lote "${lote.nombre_lote}" con una puja de $${pujaGanadora.monto}.`;
        // Enviar el mensaje al ganador
        await mensajeService.crear({
          id_remitente: 1, // ID del sistema
          id_receptor: pujaGanadora.id_usuario,
          contenido: mensaje
        });
        res.status(200).json({ mensaje: 'Subasta finalizada. Se ha notificado al ganador.' });
      } else {
        await loteService.update(id, { estado_subasta: 'finalizada', fecha_fin: new Date() });
        res.status(200).json({ mensaje: 'Subasta finalizada sin pujas. No se ha asignado un ganador.' });
      }

    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // Obtener lotes activos
  async findAllActivo(req, res) {
    try {
      const lotes = await loteService.findAllActivo();
      res.status(200).json(lotes);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
  
  // Obtener un lote activo por su ID
  async findByIdActivo(req, res) {
    try {
      const { id } = req.params;
      const lote = await loteService.findByIdActivo(id);
      if (!lote) {
        return res.status(404).json({ error: 'Lote no encontrado o no está activo.' });
      }
      res.status(200).json(lote);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
};

module.exports = loteController;