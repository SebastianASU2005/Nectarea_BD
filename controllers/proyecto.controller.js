const proyectoService = require("../services/proyecto.service");
const loteService = require("../services/lote.service");
const usuarioService = require("../services/usuario.service");
const mensajeService = require("../services/mensaje.service");
const { sequelize } = require("../config/database");
// const { validate } = require("uuid"); // ❌ Eliminado: importación de uuid innecesaria
const suscripcionProyectoService = require("../services/suscripcion_proyecto.service");
const inversionService = require("../services/inversion.service");

/**
 * Controlador de Express para gestionar las operaciones CRUD de Proyectos,
 * incluyendo la creación con notificación y la gestión de lotes asociados.
 */
const proyectoController = {
  // --- Rutas de Administrador ---

  /**
   * @async
   * @function findAll
   * @description Obtiene todos los proyectos, incluyendo inactivos (para administradores).
   * @param {object} req - Objeto de solicitud de Express.
   * @param {object} res - Objeto de respuesta de Express.
   */
  async findAll(req, res) {
    try {
      const proyectos = await proyectoService.findAll();
      res.status(200).json(proyectos);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  /**
   * @async
   * @function findById
   * @description Obtiene un proyecto por su ID (para administradores).
   * @param {object} req - Objeto de solicitud de Express (con `id` en `params`).
   * @param {object} res - Objeto de respuesta de Express.
   */
  async findById(req, res) {
    try {
      const { id } = req.params;
      const proyecto = await proyectoService.findById(id);
      if (!proyecto) {
        return res.status(404).json({ error: "Proyecto no encontrado." });
      }
      res.status(200).json(proyecto);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  /**
   * @async
   * @function create
   * @description Crea un nuevo proyecto, asocia lotes iniciales y notifica.
   * La creación del proyecto y la asociación inicial de lotes NO son transaccionales.
   * La notificación SÍ usa una transacción para manejar mensajes masivos.
   * @param {object} req - Objeto de solicitud de Express (con `lotesIds` y `proyectoData` en `body`).
   * @param {object} res - Objeto de respuesta de Express.
   */
  async create(req, res) {
    // La transacción es para asegurar que todos los mensajes se envíen o ninguno.
    const t = await sequelize.transaction();
    try {
      // Separamos los IDs de lotes del resto de los datos del proyecto
      const { lotesIds, ...proyectoData } = req.body;

      // 1. Crea el proyecto y asocia los lotes iniciales
      // Usamos la versión corregida del servicio que acepta datos y lotesIds
      const nuevoProyecto = await proyectoService.crearProyecto(
        proyectoData,
        lotesIds // Pasamos el array de IDs
      );

      // 2. Envía un mensaje a todos los usuarios activos (transaccional para mensajes masivos)
      const todosLosUsuarios = await usuarioService.findAllActivos();
      const remitente_id = 1; // Asumiendo ID 1 como remitente del sistema
      const tipoInversion = req.body.tipo_inversion || "Inversión";
      const contenido = `Se ha añadido un nuevo proyecto en la sección de ${tipoInversion}. ¡Revisa el proyecto "${nuevoProyecto.nombre_proyecto}"!`;

      for (const usuario of todosLosUsuarios) {
        if (usuario.id !== remitente_id) {
          await mensajeService.crear(
            {
              id_remitente: remitente_id,
              id_receptor: usuario.id,
              contenido: contenido,
            },
            { transaction: t }
          );
        }
      }

      await t.commit(); // Confirma la transacción de mensajes
      res.status(201).json(nuevoProyecto);
    } catch (error) {
      await t.rollback(); // Deshace la transacción de mensajes en caso de error
      // Devuelve el código 400 ya que los errores suelen ser de validación de datos
      res.status(400).json({ error: error.message });
    }
  },

  /**
   * @async
   * @function endAuction
   * @description Finaliza la subasta de un lote, asigna un ganador (si existe) y notifica.
   * @param {object} req - Objeto de solicitud de Express (con `id` del lote en `params`).
   * @param {object} res - Objeto de respuesta de Express.
   */
  async endAuction(req, res) {
    try {
      const { id } = req.params;
      const pujaGanadora = await loteService.endAuction(id); // La lógica de negocio está en el servicio

      if (pujaGanadora) {
        const mensaje = `¡Subasta finalizada! Se ha asignado un ganador para el Lote ID ${id}.`;
        res.status(200).json({ mensaje, pujaGanadoraId: pujaGanadora.id });
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

  /**
   * @async
   * @function update
   * @description Actualiza SOLO los campos directos de un proyecto.
   * La asignación de lotes se maneja en un endpoint separado.
   * @param {object} req - Objeto de solicitud de Express (con `id` en `params` y datos en `body`).
   * @param {object} res - Objeto de respuesta de Express.
   */
  async update(req, res) {
    try {
      const { id } = req.params;
      // Asegurar que no se intenten pasar lotes a esta función
      const { lotes, lotesIds, ...proyectoData } = req.body;

      // 1. Actualizar el Proyecto (sin transacción, ya que es una operación simple)
      const proyectoActualizado = await proyectoService.update(
        id,
        proyectoData
      );

      if (!proyectoActualizado) {
        return res.status(404).json({ error: "Proyecto no encontrado." });
      }

      // 2. Obtener el proyecto actualizado para la respuesta (incluyendo relaciones existentes)
      const proyectoFinal = await proyectoService.findById(id);

      res.status(200).json(proyectoFinal);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  /**
   * @async
   * @function asignarLotes
   * @description Asocia uno o varios lotes a un proyecto.
   * Utiliza la función atómica (transaccional) del servicio.
   * @param {object} req - Objeto de solicitud de Express (con `id` en `params` y `lotesIds` en `body`).
   * @param {object} res - Objeto de respuesta de Express.
   */
  async asignarLotes(req, res) {
    try {
      const { id } = req.params;
      const { lotesIds } = req.body;

      if (!lotesIds || lotesIds.length === 0) {
        return res
          .status(400)
          .json({ error: "Se requiere un array de lotesIds." });
      }

      const proyectoActualizado = await proyectoService.asignarLotesAProyecto(
        Number(id),
        lotesIds
      );

      // Obtener el proyecto completo para la respuesta (incluyendo los nuevos lotes)
      const proyectoConLotes = await proyectoService.findById(id);

      res.status(200).json({
        mensaje: `Lotes asignados exitosamente al proyecto ID ${id}.`,
        proyecto: proyectoConLotes,
      });
    } catch (error) {
      // Los errores de validación (lotes ya asignados, proyecto no encontrado) se manejan aquí.
      res.status(400).json({ error: error.message });
    }
  },

  /**
   * @async
   * @function softDelete
   * @description "Elimina" lógicamente (soft delete) un proyecto por su ID.
   * @param {object} req - Objeto de solicitud de Express (con `id` en `params`).
   * @param {object} res - Objeto de respuesta de Express.
   */
  async softDelete(req, res) {
    try {
      const { id } = req.params;
      const proyectoEliminado = await proyectoService.softDelete(id);
      if (!proyectoEliminado) {
        return res.status(404).json({ error: "Proyecto no encontrado." });
      }
      res.status(200).json({ mensaje: "Proyecto eliminado exitosamente." });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // -------------------------------------------------------------------
  // 🚨 OTRAS FUNCIONES DE ADMINISTRADOR 🚨
  // -------------------------------------------------------------------

  /**
   * @async
   * @function iniciarProceso
   * @description Pone el proyecto mensual en estado 'En proceso' e inicia/reanuda el conteo de meses (meses_restantes).
   * @param {object} req - Objeto de solicitud de Express (con `id` en `params`).
   * @param {object} res - Objeto de respuesta de Express.
   */
  async iniciarProceso(req, res) {
    try {
      const { id } = req.params;
      const proyectoActualizado = await proyectoService.iniciarConteoMensual(
        id
      );

      res.status(200).json({
        mensaje: `Proyecto ID ${id} iniciado/reanudado. Estado: En proceso. Meses restantes: ${proyectoActualizado.meses_restantes}`,
        proyecto: proyectoActualizado,
      });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  // -------------------------------------------------------------------
  // --- Rutas de Usuario ---
  // -------------------------------------------------------------------

  /**
   * @async
   * @function findAllActivo
   * @description Obtiene todos los proyectos activos (visibles para usuarios).
   * @param {object} req - Objeto de solicitud de Express.
   * @param {object} res - Objeto de respuesta de Express.
   */
  async findAllActivo(req, res) {
    try {
      const proyectos = await proyectoService.findAllActivo();
      res.status(200).json(proyectos);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
  /**
   * @async
   * @function findAllActivoAhorristas
   * @description Obtiene todos los proyectos activos con inversión de tipo 'mensual'.
   * @param {object} req - Objeto de solicitud de Express.
   * @param {object} res - Objeto de respuesta de Express.
   */
  async findAllActivoAhorristas(req, res) {
    try {
      // Llama a la nueva función del servicio que filtra por 'mensual'
      const proyectos = await proyectoService.findAllActivoMensual();
      res.status(200).json(proyectos);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
  /**
   * @async
   * @function findAllActivoInversionistas
   * @description Obtiene todos los proyectos activos con inversión de tipo 'directo'.
   * @param {object} req - Objeto de solicitud de Express.
   * @param {object} res - Objeto de respuesta de Express.
   */,

  // 🎯 NUEVO CONTROLADOR: Proyectos de Inversionistas (Tipo Directo)
  async findAllActivoInversionistas(req, res) {
    try {
      // Llama a la nueva función del servicio que filtra por 'directo'
      const proyectos = await proyectoService.findAllActivoDirecto();
      res.status(200).json(proyectos);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },  

  /**
   * @async
   * @function findByIdActivo
   * @description Obtiene un proyecto activo por su ID.
   * @param {object} req - Objeto de solicitud de Express (con `id` en `params`).
   * @param {object} res - Objeto de respuesta de Express.
   */
  async findByIdActivo(req, res) {
    try {
      const { id } = req.params;
      const proyecto = await proyectoService.findByIdActivo(id);
      if (!proyecto) {
        return res
          .status(404)
          .json({ error: "Proyecto no encontrado o no está activo." });
      }
      res.status(200).json(proyecto);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  /**
   * @async
   * @function findMyProjects
   * @description Obtiene todos los proyectos en los que el usuario autenticado tiene una
   * Suscripción o una Inversión.
   * @param {object} req - Objeto de solicitud de Express (con `req.user.id`).
   * @param {object} res - Objeto de respuesta de Express.
   */
  async findMyProjects(req, res) {
    try {
      const userId = req.user.id;

      // 1. Obtener proyectos a través de las suscripciones
      const suscripciones = await suscripcionProyectoService.findByUserId(
        userId
      );
      // ⚠️ Se asume que el servicio devuelve el proyecto asociado en una propiedad 'proyectoAsociado'
      const proyectosSuscritos = suscripciones
        .map((suscripcion) => suscripcion.proyectoAsociado)
        .filter(Boolean); // Filtrar nulos si hay

      // 2. Obtener proyectos a través de las inversiones (ej. por pujas ganadas)
      const proyectosInvertidos = await proyectoService.findByUserId(userId);

      // 3. Combinar las listas y eliminar duplicados (usando un Set)
      const todosMisProyectos = [...proyectosSuscritos, ...proyectosInvertidos];

      // Crea un mapa para almacenar proyectos únicos por ID
      const proyectosMap = new Map();
      todosMisProyectos.forEach((p) => {
        if (p && !proyectosMap.has(p.id)) {
          proyectosMap.set(p.id, p);
        }
      });
      const proyectosUnicos = Array.from(proyectosMap.values());

      res.status(200).json(proyectosUnicos);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
};

module.exports = proyectoController;
