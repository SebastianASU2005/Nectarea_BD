const proyectoService = require("../services/proyecto.service");
const loteService = require("../services/lote.service");
const usuarioService = require("../services/usuario.service");
const mensajeService = require("../services/mensaje.service");
const { sequelize } = require("../config/database");
const { validate } = require("uuid");
const suscripcionProyectoService = require("../services/suscripcion_proyecto.service");
const inversionService = require("../services/inversion.service");

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
        return res.status(404).json({ error: "Proyecto no encontrado." });
      }
      res.status(200).json(proyecto);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // Crea un nuevo proyecto. La lógica para cuotas mensuales se manejará en un paso posterior.
  async create(req, res) {
    const t = await sequelize.transaction();
    try {
      const { lotesIds, ...proyectoData } = req.body;

      // 1. Crea el proyecto
      const nuevoProyecto = await proyectoService.crearProyecto(proyectoData, {
        transaction: t,
      });

      // 2. Asocia los lotes al proyecto si se proporcionan
      if (lotesIds && lotesIds.length > 0) {
        await loteService.updateLotesProyecto(lotesIds, nuevoProyecto.id, t);
      }

      // La lógica para crear la cuota mensual ha sido eliminada de este controlador.
      // Ahora, la cuota mensual se deberá crear y asignar a través de un endpoint separado.

      // 3. Envía un mensaje a todos los usuarios
      const todosLosUsuarios = await usuarioService.findAllActivos();
      const remitente_id = 1;
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

      await t.commit();
      res.status(201).json(nuevoProyecto);
    } catch (error) {
      await t.rollback();
      res.status(400).json({ error: error.message });
    }
  },

  // Finaliza la subasta de un lote, asigna un ganador y notifica
  async endAuction(req, res) {
    try {
      const { id } = req.params;
      const transaccion = await loteService.endAuction(id);

      if (transaccion) {
        const mensaje = `¡Subasta finalizada! Se ha creado una transacción de pago con ID ${transaccion.id}.`;
        // Aquí podrías agregar la lógica para enviar el mensaje al ganador
        res.status(200).json({ mensaje });
      } else {
        res
          .status(200)
          .json({
            mensaje:
              "Subasta finalizada sin pujas. No se ha asignado un ganador.",
          });
      }
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  // Actualiza un proyecto
  async update(req, res) {
    const t = await sequelize.transaction(); // 🔑 Iniciar transacción
    try {
      const { id } = req.params; // 🔑 1. Extraer los lotesIds (usando 'lotes' o el nombre que esperes)
      const lotesIds = req.body.lotes || req.body.lotesIds;
      const { lotes, ...proyectoData } = req.body; // Evitar pasar 'lotes' a la actualización del proyecto // 🔑 2. Actualizar el Proyecto. La función del servicio debe ser modificada para aceptar la transacción.
      const proyectoActualizado = await proyectoService.update(
        id,
        proyectoData,
        t
      );

      if (!proyectoActualizado) {
        await t.rollback();
        return res.status(404).json({ error: "Proyecto no encontrado." });
      } // 🔑 3. Asociar los lotes al proyecto si se proporcionan

      if (lotesIds && lotesIds.length > 0) {
        // Se usa la función que ya existe en loteService
        await loteService.updateLotesProyecto(lotesIds, id, t);
      }

      await t.commit(); // 🔑 Terminar transacción // 4. Obtener el proyecto actualizado para la respuesta (con los lotes incluidos)
      const proyectoConLotes = await proyectoService.findById(id);

      res.status(200).json(proyectoConLotes);
    } catch (error) {
      await t.rollback(); // 🔑 Revertir si hay error
      res.status(400).json({ error: error.message });
    }
  },

  // "Elimina" un proyecto (soft delete)
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
        return res
          .status(404)
          .json({ error: "Proyecto no encontrado o no está activo." });
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

      // 1. Obtener los proyectos a través de las suscripciones
      const suscripciones = await suscripcionProyectoService.findByUserId(
        userId
      );
      const proyectosSuscritos = suscripciones.map(
        (suscripcion) => suscripcion.proyecto
      );

      // 2. Obtener los proyectos a través de las inversiones
      const inversiones = await inversionService.findByUserId(userId);
      const proyectosInvertidos = inversiones.map(
        (inversion) => inversion.proyecto
      );

      // 3. Combinar las listas y eliminar duplicados para obtener un listado único
      const todosMisProyectos = [...proyectosSuscritos, ...proyectosInvertidos];
      const proyectosUnicos = Array.from(
        new Set(todosMisProyectos.map((p) => p.id))
      ).map((id) => {
        return todosMisProyectos.find((p) => p.id === id);
      });

      res.status(200).json(proyectosUnicos);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
};

module.exports = proyectoController;
