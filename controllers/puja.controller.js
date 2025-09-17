const pujaService = require('../services/puja.service');

const pujaController = {
  // Controlador para crear una nueva puja
  async create(req, res) {
    try {
      // Tomamos el ID del usuario directamente del token
      const id_usuario = req.user.id;
      const data = { ...req.body, id_usuario };
      const nuevaPuja = await pujaService.create(data);
      res.status(201).json(nuevaPuja);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  // **NUEVA FUNCIÓN** para gestionar la finalización de la subasta
  async manageAuctionEnd(req, res) {
    try {
      // Nota: Esta ruta debería ser protegida para que solo un admin pueda usarla
      const { id_lote, id_ganador } = req.body;
      if (!id_lote || !id_ganador) {
        return res.status(400).json({ error: "id_lote y id_ganador son obligatorios." });
      }
      await pujaService.gestionarTokensAlFinalizar(id_lote, id_ganador);
      res.status(200).json({ message: "Tokens gestionados al finalizar la subasta." });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // Controlador para obtener todas las pujas (versión para administradores)
  async findAll(req, res) {
    try {
      const pujas = await pujaService.findAll();
      res.status(200).json(pujas);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // Controlador para obtener solo las pujas activas (versión para usuarios)
  async findAllActivo(req, res) {
    try {
      const pujasActivas = await pujaService.findAllActivo();
      res.status(200).json(pujasActivas);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // **NUEVA FUNCIÓN**: Obtiene las pujas del usuario autenticado
  async findMyPujas(req, res) {
    try {
      const userId = req.user.id; // Obtenemos el ID del usuario del token
      const pujas = await pujaService.findByUserId(userId);
      res.status(200).json(pujas);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // Controlador para encontrar una puja por ID (versión para administradores)
  async findById(req, res) {
    try {
      const puja = await pujaService.findById(req.params.id);
      if (!puja) {
        return res.status(404).json({ error: 'Puja no encontrada' });
      }
      res.status(200).json(puja);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // **NUEVO** - Obtener una puja por su ID y verificar propiedad (versión para usuarios)
  async findMyPujaById(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      const puja = await pujaService.findByIdAndUserId(id, userId);
      if (!puja) {
        return res.status(404).json({ error: "Puja no encontrada o no te pertenece." });
      }
      res.status(200).json(puja);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // Controlador para actualizar una puja (versión para administradores)
  async update(req, res) {
    try {
      const pujaActualizada = await pujaService.update(req.params.id, req.body);
      if (!pujaActualizada) {
        return res.status(404).json({ error: 'Puja no encontrada' });
      }
      res.status(200).json(pujaActualizada);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  // **NUEVO** - Actualizar una puja propia
  async updateMyPuja(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      const pujaActualizada = await pujaService.updateByIdAndUserId(id, userId, req.body);
      if (!pujaActualizada) {
        return res.status(404).json({ error: "Puja no encontrada o no te pertenece." });
      }
      res.status(200).json(pujaActualizada);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  // Controlador para "eliminar" una puja (versión para administradores)
  async softDelete(req, res) {
    try {
      const pujaEliminada = await pujaService.softDelete(req.params.id);
      if (!pujaEliminada) {
        return res.status(404).json({ error: 'Puja no encontrada' });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // **NUEVO** - Eliminar una puja propia
  async softDeleteMyPuja(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      const pujaEliminada = await pujaService.softDeleteByIdAndUserId(id, userId);
      if (!pujaEliminada) {
        return res.status(404).json({ error: "Puja no encontrada o no te pertenece." });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
};

module.exports = pujaController;