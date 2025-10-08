const inversionService = require("../services/inversion.service");

const inversionController = {
  // Maneja la solicitud inicial para crear una inversión (solo registro pendiente)
  async create(req, res) {
    try {
      // Tomamos el ID del usuario del token para evitar falsificación
      const id_usuario = req.user.id;
      const data = { ...req.body, id_usuario }; // 🛑 CAMBIO: Llamamos a la función que solo crea la Inversión pendiente.
      const nuevaInversion = await inversionService.crearInversion(data); // La respuesta ahora debe indicar que la inversión se creó y está pendiente de pago

      res.status(201).json({
        message:
          "Inversión registrada con éxito. Por favor, proceda a la activación del pago.",
        inversionId: nuevaInversion.id, // Retornar el ID es crucial para el paso de pago.
        modelo: "Inversion", // Útil para la ruta genérica de pago // Se podría sugerir la URL de pago, por ejemplo:
        url_pago_sugerida: `/pagos/inversion/${nuevaInversion.id}`,
      });
    } catch (error) {
      // Un error 400 es adecuado para errores de validación o lógica de negocio
      res.status(400).json({ error: error.message });
    }
  }, // Obtiene las inversiones asociadas al usuario autenticado
  async findMyInversions(req, res) {
    try {
      const userId = req.user.id;
      const inversiones = await inversionService.findByUserId(userId);
      res.status(200).json(inversiones);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }, // Obtiene todas las inversiones (versión solo para administradores, debe estar protegida por middleware)

  async findAll(req, res) {
    try {
      const inversiones = await inversionService.findAll();
      res.status(200).json(inversiones);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }, // Obtiene todas las inversiones activas (versión para administradores/general)

  async findAllActivo(req, res) {
    try {
      const inversiones = await inversionService.findAllActivo();
      res.status(200).json(inversiones);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }, // Encuentra una inversión por su ID (versión para administradores)

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
  }, // **NUEVO** - Encuentra una inversión por su ID y verifica propiedad (versión segura para usuario)
  async findMyInversionById(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id; // Se asume que existe un método 'findByIdAndUserId' en el servicio
      const inversion = await inversionService.findByIdAndUserId(id, userId);
      if (!inversion) {
        return res
          .status(404)
          .json({ message: "Inversión no encontrada o no te pertenece." });
      }
      res.status(200).json(inversion);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }, // Actualiza una inversión (versión para administradores)

  async update(req, res) {
    try {
      const { id } = req.params; // Esta ruta debe ser protegida por un middleware de administrador
      const inversionActualizada = await inversionService.update(id, req.body);
      if (!inversionActualizada) {
        return res.status(404).json({ message: "Inversión no encontrada" });
      }
      res.status(200).json(inversionActualizada);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }, // **NUEVO** - Actualiza una inversión propia (versión segura para usuario)
  async updateMyInversion(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id; // Se asume que existe un método 'updateByIdAndUserId' en el servicio
      const inversionActualizada = await inversionService.updateByIdAndUserId(
        id,
        userId,
        req.body
      );
      if (!inversionActualizada) {
        return res
          .status(404)
          .json({ message: "Inversión no encontrada o no te pertenece." });
      }
      res.status(200).json(inversionActualizada);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }, // "Elimina" una inversión (soft delete) (versión para administradores)

  async softDelete(req, res) {
    try {
      const { id } = req.params; // Esta ruta debe ser protegida por un middleware de administrador
      const inversionEliminada = await inversionService.softDelete(id);
      if (!inversionEliminada) {
        return res.status(404).json({ message: "Inversión no encontrada" });
      } // 204 No Content es la respuesta estándar para una eliminación exitosa
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }, // **NUEVO** - "Elimina" una inversión propia (soft delete) (versión segura para usuario)
  async softDeleteMyInversion(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id; // Se asume que existe un método 'softDeleteByIdAndUserId' en el servicio
      const inversionEliminada = await inversionService.softDeleteByIdAndUserId(
        id,
        userId
      );
      if (!inversionEliminada) {
        return res
          .status(404)
          .json({ message: "Inversión no encontrada o no te pertenece." });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
};

module.exports = inversionController;
