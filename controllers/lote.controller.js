const loteService = require("../services/lote.service");
const proyectoService = require("../services/proyecto.service");
const pujaService = require("../services/puja.service"); // Importado, pero no usado directamente en el controlador
const mensajeService = require("../services/mensaje.service");
const SuscripcionProyectoService = require("../services/suscripcion_proyecto.service");

/**
 * Controlador de Express para gestionar la información y el ciclo de vida de los Lotes.
 * Incluye funcionalidades para subastas (inicio y fin) y notificación de eventos.
 */
const loteController = {
  // ===================================================================
  // FUNCIONES BÁSICAS (CRUD)
  // ===================================================================

  /**
   * @async
   * @function findAll
   * @description Obtiene todos los lotes (para administradores).
   * @param {object} req - Objeto de solicitud de Express.
   * @param {object} res - Objeto de respuesta de Express.
   */
  async findAll(req, res) {
    try {
      const lotes = await loteService.findAll();
      res.status(200).json(lotes);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  /**
   * @async
   * @function findById
   * @description Obtiene un lote por su ID (para administradores).
   * @param {object} req - Objeto de solicitud de Express (con `id` en `params`).
   * @param {object} res - Objeto de respuesta de Express.
   */
  async findById(req, res) {
    try {
      const { id } = req.params;
      const lote = await loteService.findById(id);
      if (!lote) {
        return res.status(404).json({ error: "Lote no encontrado." });
      }
      res.status(200).json(lote);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  /**
   * @async
   * @function create
   * @description Crea un nuevo lote.
   * @param {object} req - Objeto de solicitud de Express (con datos del lote en `body`).
   * @param {object} res - Objeto de respuesta de Express.
   */
  async create(req, res) {
    try {
      const nuevoLote = await loteService.create(req.body);
      res.status(201).json(nuevoLote);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  /**
   * @async
   * @function update
   * @description Actualiza un lote por su ID.
   * @param {object} req - Objeto de solicitud de Express (con `id` en `params` y datos en `body`).
   * @param {object} res - Objeto de respuesta de Express.
   */
  async update(req, res) {
    try {
      const { id } = req.params;
      const loteActualizado = await loteService.update(id, req.body);
      if (!loteActualizado) {
        return res.status(404).json({ error: "Lote no encontrado." });
      }
      res.status(200).json(loteActualizado);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  /**
   * @async
   * @function softDelete
   * @description "Elimina" lógicamente (soft delete) un lote.
   * @param {object} req - Objeto de solicitud de Express (con `id` en `params`).
   * @param {object} res - Objeto de respuesta de Express.
   */
  async softDelete(req, res) {
    try {
      const { id } = req.params;
      const loteEliminado = await loteService.softDelete(id);
      if (!loteEliminado) {
        return res.status(404).json({ error: "Lote no encontrado." });
      }
      res.status(200).json({ mensaje: "Lote eliminado exitosamente." });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // ===================================================================
  // FUNCIONES DE SUBASTA Y NOTIFICACIÓN
  // ===================================================================

  /**
   * @async
   * @function startAuction
   * @description Inicia la subasta de un lote, actualizando su estado y notificando
   * a todos los usuarios suscritos al proyecto asociado.
   * @param {object} req - Objeto de solicitud de Express (con `id` del lote en `params`).
   * @param {object} res - Objeto de respuesta de Express.
   */
  async startAuction(req, res) {
    try {
      const { id } = req.params;

      // 1. Validar Lote y Proyecto
      const lote = await loteService.findById(id);
      if (!lote) {
        return res.status(404).json({ error: "Lote no encontrado." });
      }
      const proyecto = await proyectoService.findById(lote.id_proyecto);
      if (!proyecto) {
        return res
          .status(404)
          .json({ error: "Proyecto asociado no encontrado." });
      }

      // 2. Actualizar estado de la subasta del lote
      await loteService.update(id, {
        estado_subasta: "activa",
        fecha_inicio: new Date(),
      });

      // 3. Obtener usuarios suscritos al proyecto
      const suscriptores =
        await SuscripcionProyectoService.findUsersByProjectId(proyecto.id);

      // 4. Enviar notificación a cada suscriptor
      const remitente_id = 1; // ID de un usuario del sistema (ej. administrador)
      const contenido = `¡La subasta del lote "${lote.nombre_lote}" del proyecto "${proyecto.nombre_proyecto}" ha comenzado!`;

      for (const suscriptor of suscriptores) {
        // Se asume que el servicio de mensajes maneja la creación de la notificación
        await mensajeService.crear({
          id_remitente: remitente_id,
          id_receptor: suscriptor.id,
          contenido: contenido,
        });
      }

      res
        .status(200)
        .json({ mensaje: "Subasta iniciada y notificaciones enviadas." });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  /**
   * @async
   * @function endAuction
   * @description Finaliza la subasta de un lote. Delega la lógica de asignación
   * del ganador y creación de transacción al servicio.
   * @param {object} req - Objeto de solicitud de Express (con `id` del lote en `params`).
   * @param {object} res - Objeto de respuesta de Express.
   */
  async endAuction(req, res) {
    try {
      const { id } = req.params;
      // La función del servicio se encarga de: verificar pujas, asignar ganador, crear transacción.
      const transaccion = await loteService.endAuction(id);

      if (transaccion) {
        const mensaje = `¡Subasta finalizada! Se ha creado una transacción de pago con ID ${transaccion.id}.`;
        // Aquí se enviaría la notificación al ganador
        res.status(200).json({ mensaje });
      } else {
        res.status(200).json({
          mensaje:
            "Subasta finalizada sin pujas. No se ha asignado un ganador.",
        });
      }
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  // ===================================================================
  // FUNCIONES PÚBLICAS (USUARIOS)
  // ===================================================================

  /**
   * @async
   * @function findAllActivo
   * @description Obtiene todos los lotes activos (visibles para usuarios).
   * @param {object} req - Objeto de solicitud de Express.
   * @param {object} res - Objeto de respuesta de Express.
   */
  async findAllActivo(req, res) {
    try {
      const lotes = await loteService.findAllActivo();
      res.status(200).json(lotes);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  /**
   * @async
   * @function findByIdActivo
   * @description Obtiene un lote activo por su ID.
   * @param {object} req - Objeto de solicitud de Express (con `id` en `params`).
   * @param {object} res - Objeto de respuesta de Express.
   */
  async findByIdActivo(req, res) {
    try {
      const { id } = req.params;
      const lote = await loteService.findByIdActivo(id);
      if (!lote) {
        return res
          .status(404)
          .json({ error: "Lote no encontrado o no está activo." });
      }
      res.status(200).json(lote);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
  /**
   * @async
   * @function findLotesNoAssociated
   * @description Obtiene todos los lotes que aún no han sido asociados a ningún proyecto.
   * @param {object} req - Objeto de solicitud de Express.
   * @param {object} res - Objeto de respuesta de Express.
   */
  async findLotesNoAssociated(req, res) {
    try {
      const lotes = await loteService.findLotesSinProyecto();
      res.status(200).json(lotes);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  /**
   * @async
   * @function findLotesByProject
   * @description Obtiene todos los lotes asociados a un ID de proyecto específico.
   * @param {object} req - Objeto de solicitud de Express (con `idProyecto` en `params`).
   * @param {object} res - Objeto de respuesta de Express.
   */
  async findLotesByProject(req, res) {
    try {
      const { idProyecto } = req.params;
      if (!idProyecto) {
        return res
          .status(400)
          .json({ error: "El ID del proyecto es requerido." });
      }

      const lotes = await loteService.findLotesByProyectoId(idProyecto);
      res.status(200).json(lotes);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },
};

module.exports = loteController;
