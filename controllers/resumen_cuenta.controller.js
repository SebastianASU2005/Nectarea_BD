const resumenCuentaService = require("../services/resumen_cuenta.service");
const cuotaMensualService = require("../services/cuota_mensual.service");
const Proyecto = require("../models/proyecto");
const Suscripcion = require("../models/suscripcion_proyecto");

const resumenCuentaController = {
  /**
   * Crea un nuevo resumen de cuenta.
   * @param {object} req - Objeto de solicitud de Express.
   * @param {object} res - Objeto de respuesta de Express.
   */
  async create(req, res) {
    try {
      const {
        id_suscripcion,
        id_proyecto,
        nombre_cemento, // Aquí obtenemos el nombre del cemento de la solicitud
        valor_cemento_unidades,
        valor_cemento,
        meses_proyecto,
        porcentaje_plan,
        porcentaje_administrativo,
        porcentaje_iva,
      } = req.body;

      // 1. Obtener el nombre del proyecto.
      const proyecto = await Proyecto.findByPk(id_proyecto);
      if (!proyecto) {
        return res.status(404).json({ message: "Proyecto no encontrado." });
      }

      // 2. Crear la cuota mensual para el proyecto.
      const datosCuota = {
        id_proyecto: id_proyecto,
        nombre_proyecto: proyecto.nombre_proyecto,
        nombre_cemento_cemento: nombre_cemento, // Aseguramos que se pasa el nombre del cemento al servicio
        valor_cemento_unidades: valor_cemento_unidades,
        valor_cemento: valor_cemento,
        total_cuotas_proyecto: meses_proyecto,
        porcentaje_plan: porcentaje_plan,
        porcentaje_administrativo: porcentaje_administrativo,
        porcentaje_iva: porcentaje_iva,
      };

      const nuevaCuota = await cuotaMensualService.createAndSetProjectAmount(datosCuota);

      // 3. Crear el resumen de cuenta.
      const nuevoResumen = await resumenCuentaService.create({
        id_suscripcion: id_suscripcion,
        nombre_proyecto: proyecto.nombre_proyecto,
        meses_proyecto: meses_proyecto,
        detalle_cuota: {
          valor_movil: nuevaCuota.valor_movil,
          valor_cemento: nuevaCuota.valor_cemento,
          valor_mensual: nuevaCuota.valor_mensual,
          nombre_cemento: nuevaCuota.nombre_cemento, // Ya corregido en el servicio, lo tomamos de la cuota
          porcentaje_plan: nuevaCuota.porcentaje_plan,
          valor_mensual_final: nuevaCuota.valor_mensual_final,
          carga_administrativa: nuevaCuota.carga_administrativa,
          valor_cemento_unidades: nuevaCuota.valor_cemento_unidades,
          iva_carga_administrativa: nuevaCuota.iva_carga_administrativa,
        },
      });

      res.status(201).json({ message: "Resumen de cuenta creado.", resumen_cuenta: nuevoResumen });
    } catch (error) {
      console.error("Error al crear el resumen de cuenta:", error);
      res.status(500).json({
        message: "Error al crear el resumen de cuenta.",
        error: error.message,
      });
    }
  },

  /**
   * Obtiene todos los resúmenes de cuenta del usuario autenticado.
   * AVISO: Esta es la función que fue optimizada para evitar múltiples consultas.
   * @param {object} req - Objeto de solicitud de Express.
   * @param {object} res - Objeto de respuesta de Express.
   */
  async getAccountSummaries(req, res) {
    try {
      // Nota: Aquí se asume que el ID de usuario está disponible en req.user
      const userId = req.user.id;
      // Usamos la función del servicio que obtiene todos los resúmenes del usuario en una sola llamada.
      const resumenes = await resumenCuentaService.getAccountSummariesByUserId(userId);

      res.status(200).json(resumenes);
    } catch (error) {
      console.error("Error al obtener los resúmenes de cuenta:", error);
      res.status(500).json({
        message: "Error al obtener los resúmenes de cuenta.",
        error: error.message,
      });
    }
  },

  /**
   * Obtiene un resumen de cuenta específico por su ID.
   * @param {object} req - Objeto de solicitud de Express.
   * @param {object} res - Objeto de respuesta de Express.
   */
  async getAccountSummaryById(req, res) {
    try {
      const { id } = req.params;
      const resumen = await resumenCuentaService.findById(id);

      if (!resumen) {
        return res.status(404).json({ message: "Resumen de cuenta no encontrado." });
      }

      res.status(200).json(resumen);
    } catch (error) {
      console.error("Error al obtener el resumen de cuenta por ID:", error);
      res.status(500).json({
        message: "Error al obtener el resumen de cuenta por ID.",
        error: error.message,
      });
    }
  },

  /**
   * Actualiza un resumen de cuenta por su ID.
   * @param {object} req - Objeto de solicitud de Express.
   * @param {object} res - Objeto de respuesta de Express.
   */
  async update(req, res) {
    try {
      const { id } = req.params;
      const data = req.body;
      const updatedResumen = await resumenCuentaService.update(id, data);
      if (!updatedResumen) {
        return res.status(404).json({ message: "Resumen de cuenta no encontrado." });
      }
      res.status(200).json(updatedResumen);
    } catch (error) {
      console.error("Error al actualizar el resumen de cuenta:", error);
      res.status(500).json({
        message: "Error al actualizar el resumen de cuenta.",
        error: error.message,
      });
    }
  },

  /**
   * Elimina lógicamente un resumen de cuenta.
   * @param {object} req - Objeto de solicitud de Express.
   * @param {object} res - Objeto de respuesta de Express.
   */
  async softDelete(req, res) {
    try {
      const { id } = req.params;
      const deletedResumen = await resumenCuentaService.softDelete(id);
      if (!deletedResumen) {
        return res.status(404).json({ message: "Resumen de cuenta no encontrado." });
      }
      res.status(200).json({ message: "Resumen de cuenta eliminado lógicamente." });
    } catch (error) {
      console.error("Error al eliminar el resumen de cuenta:", error);
      res.status(500).json({
        message: "Error al eliminar el resumen de cuenta.",
        error: error.message,
      });
    }
  },
};

module.exports = resumenCuentaController;
