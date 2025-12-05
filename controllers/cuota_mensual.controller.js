const cuotaMensualService = require("../services/cuota_mensual.service");
const proyectoService = require("../services/proyecto.service");

/**
 * Controlador de Express para gestionar las Cuotas Mensuales de los Proyectos.
 * 🆕 Ahora incluye información sobre la sincronización de ResumenCuenta.
 */
const cuotaMensualController = {
  /**
   * @async
   * @function create
   * @description Crea una nueva cuota mensual y sincroniza todos los resúmenes de cuenta del proyecto.
   */
  async create(req, res) {
    try {
      const { id_proyecto, nombre_cemento_cemento, ...cuotaMensualData } =
        req.body;

      if (!id_proyecto) {
        return res
          .status(400)
          .json({ error: "El id_proyecto es un campo requerido." });
      }

      // Buscar el proyecto
      const proyecto = await proyectoService.findById(id_proyecto);

      if (!proyecto) {
        return res.status(404).json({ error: "Proyecto no encontrado." });
      }

      // Preparar datos completos
      const datosCompletosCuota = {
        ...cuotaMensualData,
        id_proyecto: id_proyecto,
        nombre_cemento_cemento: nombre_cemento_cemento,
        nombre_proyecto: proyecto.nombre_proyecto,
        total_cuotas_proyecto: proyecto.plazo_inversion,
      };

      // Crear cuota y sincronizar resúmenes
      const resultado = await cuotaMensualService.createAndSetProjectAmount(
        datosCompletosCuota
      );

      // 🆕 Respuesta mejorada con información de sincronización
      res.status(201).json({
        success: true,
        mensaje: "Cuota mensual creada exitosamente",
        cuota: resultado.cuota,
        sincronizacion: {
          resumenes_actualizados: resultado.resumenes_actualizados,
          mensaje:
            resultado.resumenes_actualizados > 0
              ? `Se actualizaron ${resultado.resumenes_actualizados} resúmenes de cuenta con los nuevos valores`
              : "No hay resúmenes de cuenta para actualizar (aún no hay suscripciones)",
        },
      });
    } catch (error) {
      console.error("❌ Error al crear cuota mensual:", error);
      res.status(400).json({
        success: false,
        error: error.message,
      });
    }
  },

  /**
   * @async
   * @function update
   * @description Actualiza una cuota mensual y sincroniza automáticamente los resúmenes.
   */
  async update(req, res) {
    try {
      const { id } = req.params;

      const resultado = await cuotaMensualService.update(id, req.body);

      if (!resultado) {
        return res.status(404).json({
          success: false,
          error: "Cuota no encontrada.",
        });
      }

      // 🆕 Respuesta mejorada con información de sincronización
      res.status(200).json({
        success: true,
        mensaje: "Cuota mensual actualizada exitosamente",
        cuota: resultado.cuota,
        sincronizacion: {
          resumenes_actualizados: resultado.resumenes_actualizados,
          mensaje:
            resultado.resumenes_actualizados > 0
              ? `✅ Se actualizaron ${resultado.resumenes_actualizados} resúmenes de cuenta con los nuevos precios`
              : "⚠️ No hay resúmenes de cuenta activos para este proyecto",
        },
      });
    } catch (error) {
      console.error("❌ Error al actualizar cuota mensual:", error);
      res.status(400).json({
        success: false,
        error: error.message,
      });
    }
  },

  /**
   * @async
   * @function softDelete
   * @description Elimina lógicamente una cuota por ID.
   */
  async softDelete(req, res) {
    try {
      const { id } = req.params;
      const cuotaEliminada = await cuotaMensualService.softDelete(id);

      if (!cuotaEliminada) {
        return res.status(404).json({
          success: false,
          error: "Cuota no encontrada.",
        });
      }

      res.status(200).json({
        success: true,
        mensaje: "Cuota eliminada exitosamente.",
      });
    } catch (error) {
      console.error("❌ Error al eliminar cuota:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  },

  /**
   * @async
   * @function findByProjectId
   * @description Obtiene todas las cuotas de un proyecto específico.
   */
  async findByProjectId(req, res) {
    try {
      const { id_proyecto } = req.params;
      const cuotas = await cuotaMensualService.findByProjectId(id_proyecto);

      res.status(200).json({
        success: true,
        total: cuotas.length,
        cuotas: cuotas,
      });
    } catch (error) {
      console.error("❌ Error al obtener cuotas:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  },

  /**
   * @async
   * @function findLastByProjectId
   * @description Obtiene la cuota más reciente (última) de un proyecto específico.
   */
  async findLastByProjectId(req, res) {
    try {
      const { id_proyecto } = req.params;
      const cuota = await cuotaMensualService.findLastByProjectId(id_proyecto);

      if (!cuota) {
        return res.status(404).json({
          success: false,
          error: "No se encontró ninguna cuota para este proyecto.",
        });
      }

      res.status(200).json({
        success: true,
        cuota: cuota,
      });
    } catch (error) {
      console.error("❌ Error al obtener última cuota:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  },
};

module.exports = cuotaMensualController;
