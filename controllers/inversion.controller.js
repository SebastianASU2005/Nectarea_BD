const inversionService = require("../services/inversion.service");

const inversionController = {
  // Maneja la solicitud inicial para crear una inversión y su transacción
  async create(req, res) {
    try {
      // Tomamos el ID del usuario del token para evitar falsificación
      const id_usuario = req.user.id;
      const data = { ...req.body, id_usuario };
      
      // Llama a la función correcta que crea tanto la inversión como la transacción
      const resultado = await inversionService.crearInversionYTransaccion(data);
      
      res.status(201).json(resultado);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  // Obtiene las inversiones asociadas al usuario autenticado
  async findMyInversions(req, res) {
    try {
      const userId = req.user.id;
      const inversiones = await inversionService.findByUserId(userId);
      res.status(200).json(inversiones);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // Obtiene todas las inversiones (para administradores)
  async findAll(req, res) {
    try {
      const inversiones = await inversionService.findAll();
      res.status(200).json(inversiones);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // Obtiene todas las inversiones activas
  async findAllActivo(req, res) {
    try {
      const inversiones = await inversionService.findAllActivo();
      res.status(200).json(inversiones);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // Encuentra una inversión por su ID
  async findById(req, res) {
    try {
      const { id } = req.params;
      const inversion = await inversionService.findById(id);
      if (!inversion) {
        return res.status(404).json({ message: "Inversión no encontrada" });
      }
      res.status(200).json(inversion);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // Actualiza una inversión
  async update(req, res) {
    try {
      const { id } = req.params;
      const inversionActualizada = await inversionService.update(id, req.body);
      if (!inversionActualizada) {
        return res.status(404).json({ message: "Inversión no encontrada" });
      }
      res.status(200).json(inversionActualizada);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  // "Elimina" una inversión (soft delete)
  async softDelete(req, res) {
    try {
      const { id } = req.params;
      const inversionEliminada = await inversionService.softDelete(id);
      if (!inversionEliminada) {
        return res.status(404).json({ message: "Inversión no encontrada" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
};

module.exports = inversionController;
