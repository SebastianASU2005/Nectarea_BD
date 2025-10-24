const cuotaMensualService = require("../services/cuota_mensual.service");
const proyectoService = require("../services/proyecto.service");

/**
 * Controlador de Express para gestionar las Cuotas Mensuales de los Proyectos.
 * Contiene lógica para la creación de la cuota y la actualización del monto del proyecto.
 */
const cuotaMensualController = {
  // ===================================================================
  // FUNCIONES CRUD Y LÓGICA DE CREACIÓN ESPECIALIZADA
  // ===================================================================

  /**
   * @async
   * @function create
   * @description Crea una nueva cuota mensual. Antes de crear, busca el proyecto asociado
   * para obtener datos (nombre, plazo) y luego delega al servicio la creación
   * y el ajuste del monto total del proyecto.
   * @param {object} req - Objeto de solicitud de Express (con datos de la cuota y `id_proyecto` en `body`).
   * @param {object} res - Objeto de respuesta de Express.
   */
  async create(req, res) {
    try {
      // Desestructuramos el id_proyecto y los datos del cuerpo
      const { id_proyecto, nombre_cemento_cemento, ...cuotaMensualData } =
        req.body;

      // 1. Verificar si el id_proyecto fue proporcionado
      if (!id_proyecto) {
        return res
          .status(400)
          .json({ error: "El id_proyecto es un campo requerido." });
      }

      // 2. Buscar el proyecto para obtener su nombre y el plazo de inversión
      const proyecto = await proyectoService.findById(id_proyecto);

      if (!proyecto) {
        return res.status(404).json({ error: "Proyecto no encontrado." });
      }

      // 3. Crear un objeto con todos los datos, incluyendo los valores del proyecto
      const datosCompletosCuota = {
        ...cuotaMensualData,
        id_proyecto: id_proyecto,
        nombre_cemento_cemento: nombre_cemento_cemento, // Nuevo campo
        nombre_proyecto: proyecto.nombre_proyecto,
        total_cuotas_proyecto: proyecto.plazo_inversion, // Usamos el plazo para la cantidad de cuotas
      };

      // 4. Pasar el objeto completo al servicio para la creación y el ajuste del monto del proyecto
      const nuevaCuota = await cuotaMensualService.createAndSetProjectAmount(
        datosCompletosCuota
      );
      res.status(201).json(nuevaCuota);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  /**
   * @async
   * @function update
   * @description Actualiza una cuota mensual por ID.
   * @param {object} req - Objeto de solicitud de Express (con `id` en `params` y datos en `body`).
   * @param {object} res - Objeto de respuesta de Express.
   */
  async update(req, res) {
    try {
      const { id } = req.params;
      const cuotaActualizada = await cuotaMensualService.update(id, req.body);
      if (!cuotaActualizada) {
        return res.status(404).json({ error: "Cuota no encontrada." });
      }
      res.status(200).json(cuotaActualizada);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  /**
   * @async
   * @function softDelete
   * @description Elimina lógicamente una cuota por ID.
   * @param {object} req - Objeto de solicitud de Express (con `id` en `params`).
   * @param {object} res - Objeto de respuesta de Express.
   */
  async softDelete(req, res) {
    try {
      const { id } = req.params;
      const cuotaEliminada = await cuotaMensualService.softDelete(id);
      if (!cuotaEliminada) {
        return res.status(404).json({ error: "Cuota no encontrada." });
      }
      res.status(200).json({ mensaje: "Cuota eliminada exitosamente." });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // ===================================================================
  // FUNCIONES DE CONSULTA
  // ===================================================================

  /**
   * @async
   * @function findByProjectId
   * @description Obtiene todas las cuotas de un proyecto específico.
   * @param {object} req - Objeto de solicitud de Express (con `id_proyecto` en `params`).
   * @param {object} res - Objeto de respuesta de Express.
   */
  async findByProjectId(req, res) {
    try {
      const { id_proyecto } = req.params;
      const cuotas = await cuotaMensualService.findByProjectId(id_proyecto);
      res.status(200).json(cuotas);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  /**
   * @async
   * @function findLastByProjectId
   * @description Obtiene la cuota más reciente (última) de un proyecto específico.
   * Útil para calcular el precio actual.
   * @param {object} req - Objeto de solicitud de Express (con `id_proyecto` en `params`).
   * @param {object} res - Objeto de respuesta de Express.
   */
  async findLastByProjectId(req, res) {
    try {
      const { id_proyecto } = req.params;
      const cuota = await cuotaMensualService.findLastByProjectId(id_proyecto);
      if (!cuota) {
        return res
          .status(404)
          .json({ error: "No se encontró ninguna cuota para este proyecto." });
      }
      res.status(200).json(cuota);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
};

module.exports = cuotaMensualController;
