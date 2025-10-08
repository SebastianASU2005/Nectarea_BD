const pujaService = require("../services/puja.service");
// ⚠️ IMPORTACIÓN ASUMIDA: Se requiere un servicio para gestionar la creación de transacciones externas
const TransaccionService = require("../services/transaccion.service");

const pujaController = {
  // Controlador para crear una nueva puja
  async create(req, res) {
    try {
      const id_usuario = req.user.id;
      const data = { ...req.body, id_usuario };
      const nuevaPuja = await pujaService.create(data);
      res.status(201).json(nuevaPuja);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  // 🛑 FUNCIÓN CLAVE REFACTORIZADA: Prepara el checkout para una puja ganadora.
  // Toda la lógica de validación, preparación del payload y llamada a TransaccionService
  // se mueve a `pujaService.requestCheckoutForPuja(pujaId, userId)`.
  async requestCheckout(req, res) {
    const pujaId = req.params.id;
    const userId = req.user.id;

    try {
      // 1. Delegación completa de la orquestación de checkout al servicio.
      // El servicio se encarga de:
      // a) Validar el estado de la puja.
      // b) Calcular el monto.
      // c) Construir el payload de la transacción (tipo_entidad, id_entidad, metadata).
      // d) Llamar a TransaccionService.createTransactionAndGetCheckoutUrl.
      const checkoutResult = await pujaService.requestCheckoutForPuja(
        pujaId,
        userId
      );

      // 2. Retornar el URL de la pasarela de pago al cliente
      res.status(200).json({
        message: `Transacción creada exitosamente para Puja ID ${pujaId}. Redirigiendo a pasarela de pago.`,
        transaccion_id: checkoutResult.transaccion.id,
        url_checkout: checkoutResult.checkoutUrl,
      });
    } catch (error) {
      const message = error.message;

      // Manejo de errores específicos lanzados por el servicio
      if (
        message.includes("Acceso denegado") ||
        message.includes("no encontrada")
      ) {
        // 403 o 404 para errores de acceso/existencia
        return res.status(403).json({ error: message });
      }
      if (message.includes("no está en estado")) {
        // 409 Conflict si el estado no es 'ganadora_pendiente' (ej. ya está pagada)
        return res.status(409).json({ error: message });
      }

      // Captura otros errores del proceso de negocio o la pasarela de pago
      res.status(400).json({ error: message });
    }
  },

  // **NUEVA FUNCIÓN** para gestionar la finalización de la subasta
  async manageAuctionEnd(req, res) {
    try {
      const { id_lote, id_ganador } = req.body;
      if (!id_lote || !id_ganador) {
        return res
          .status(400)
          .json({ error: "id_lote y id_ganador son obligatorios." });
      }
      // NOTA: Se ha mantenido la gestión de tokens en el servicio.
      // Si esta función solo gestiona tokens, está bien. Si debería hacer más,
      // su nombre podría necesitar un cambio (ej. `finalizarSubasta`).
      await pujaService.gestionarTokensAlFinalizar(id_lote);
      res
        .status(200)
        .json({ message: "Tokens gestionados al finalizar la subasta." });
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

  // **NUEVO** - Obtener una puja por su ID (versión para administradores)
  async findById(req, res) {
    try {
      const { id } = req.params; // Asume que pujaService.findById existe y recupera la puja sin verificar userId
      const puja = await pujaService.findById(id);
      if (!puja) {
        return res.status(404).json({ error: "Puja no encontrada." });
      }
      res.status(200).json(puja);
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
      const userId = req.user.id;
      const pujas = await pujaService.findByUserId(userId);
      res.status(200).json(pujas);
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
        return res
          .status(404)
          .json({ error: "Puja no encontrada o no te pertenece." });
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
        return res.status(404).json({ error: "Puja no encontrada" });
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
      const pujaActualizada = await pujaService.updateByIdAndUserId(
        id,
        userId,
        req.body
      );
      if (!pujaActualizada) {
        return res
          .status(404)
          .json({ error: "Puja no encontrada o no te pertenece." });
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
        return res.status(404).json({ error: "Puja no encontrada" });
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
      const pujaEliminada = await pujaService.softDeleteByIdAndUserId(
        id,
        userId
      );
      if (!pujaEliminada) {
        return res
          .status(404)
          .json({ error: "Puja no encontrada o no te pertenece." });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
};

module.exports = pujaController;
