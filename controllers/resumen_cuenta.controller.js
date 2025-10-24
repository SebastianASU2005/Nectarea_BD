const resumenCuentaService = require("../services/resumen_cuenta.service");
const cuotaMensualService = require("../services/cuota_mensual.service");
const Proyecto = require("../models/proyecto");
const Suscripcion = require("../models/suscripcion_proyecto"); // Importado pero no usado directamente en este fragmento.

/**
 * Controlador de Express para manejar las peticiones HTTP relacionadas con los Resúmenes de Cuenta.
 * Incluye lógica para crear resúmenes y cuotas asociadas, y diferenciar accesos (usuario vs. admin).
 */
const resumenCuentaController = {
  /**
   * @async
   * @function create
   * @description Crea una nueva Cuota Mensual y, basándose en ella, un nuevo Resumen de Cuenta.
   * Requiere datos de configuración del proyecto y la suscripción.
   * @param {object} req - Objeto de solicitud de Express.
   * @param {object} res - Objeto de respuesta de Express.
   */
  async create(req, res) {
    try {
      const {
        id_suscripcion,
        id_proyecto,
        nombre_cemento, // Nombre del cemento (ej: 'Holcim Tipo 1')
        valor_cemento_unidades, // Unidades de cemento
        valor_cemento, // Precio actual por unidad
        meses_proyecto,
        porcentaje_plan,
        porcentaje_administrativo,
        porcentaje_iva,
      } = req.body;

      // 1. Obtener el nombre del proyecto para incluirlo en los registros.
      const proyecto = await Proyecto.findByPk(id_proyecto);
      if (!proyecto) {
        return res.status(404).json({ message: "Proyecto no encontrado." });
      }

      // 2. Crear la cuota mensual de referencia para el proyecto.
      const datosCuota = {
        id_proyecto: id_proyecto,
        nombre_proyecto: proyecto.nombre_proyecto,
        nombre_cemento_cemento: nombre_cemento,
        valor_cemento_unidades: valor_cemento_unidades,
        valor_cemento: valor_cemento,
        total_cuotas_proyecto: meses_proyecto,
        porcentaje_plan: porcentaje_plan,
        porcentaje_administrativo: porcentaje_administrativo,
        porcentaje_iva: porcentaje_iva,
      };

      // El servicio calcula el valor mensual final y otros campos.
      const nuevaCuota = await cuotaMensualService.createAndSetProjectAmount(
        datosCuota
      );

      // 3. Crear el resumen de cuenta utilizando los datos calculados en la cuota.
      const nuevoResumen = await resumenCuentaService.create({
        id_suscripcion: id_suscripcion,
        nombre_proyecto: proyecto.nombre_proyecto,
        meses_proyecto: meses_proyecto,
        // Almacena todos los detalles de la cuota como un objeto JSON dentro del resumen
        detalle_cuota: {
          valor_movil: nuevaCuota.valor_movil,
          valor_cemento: nuevaCuota.valor_cemento,
          valor_mensual: nuevaCuota.valor_mensual,
          nombre_cemento: nuevaCuota.nombre_cemento,
          porcentaje_plan: nuevaCuota.porcentaje_plan,
          valor_mensual_final: nuevaCuota.valor_mensual_final,
          carga_administrativa: nuevaCuota.carga_administrativa,
          valor_cemento_unidades: nuevaCuota.valor_cemento_unidades,
          iva_carga_administrativa: nuevaCuota.iva_carga_administrativa,
        },
      });

      res.status(201).json({
        message: "Resumen de cuenta creado.",
        resumen_cuenta: nuevoResumen,
      });
    } catch (error) {
      console.error("Error al crear el resumen de cuenta:", error);
      res.status(500).json({
        message: "Error al crear el resumen de cuenta.",
        error: error.message,
      });
    }
  },

  /**
   * @async
   * @function findMyAccountSummaries
   * @description Obtiene todos los resúmenes de cuenta del **usuario autenticado**.
   * @param {object} req - Objeto de solicitud de Express (con `req.user.id`).
   * @param {object} res - Objeto de respuesta de Express.
   */
  async findMyAccountSummaries(req, res) {
    try {
      const userId = req.user.id;
      // Llama al servicio que realiza el filtro por ID de usuario
      const resumenes = await resumenCuentaService.getAccountSummariesByUserId(
        userId
      );

      res.status(200).json(resumenes);
    } catch (error) {
      console.error(
        "Error al obtener los resúmenes de cuenta del usuario:",
        error
      );
      res.status(500).json({
        message: "Error al obtener los resúmenes de cuenta del usuario.",
        error: error.message,
      });
    }
  },

  /**
   * @async
   * @function findAll
   * @description Obtiene **TODOS** los resúmenes de cuenta. Ruta exclusiva para administradores.
   * @param {object} req - Objeto de solicitud de Express.
   * @param {object} res - Objeto de respuesta de Express.
   */
  async findAll(req, res) {
    try {
      // Función sin filtro de usuario
      const resumenes = await resumenCuentaService.findAll();

      res.status(200).json(resumenes);
    } catch (error) {
      console.error("Error al obtener todos los resúmenes de cuenta:", error);
      res.status(500).json({
        message: "Error al obtener todos los resúmenes de cuenta.",
        error: error.message,
      });
    }
  },

  /**
   * @async
   * @function getAccountSummaryById
   * @description Obtiene un resumen de cuenta específico por ID.
   * Implementa control de acceso: permite a administradores ver cualquiera, y a usuarios ver solo el suyo.
   * @param {object} req - Objeto de solicitud de Express (con `req.params.id` y `req.user`).
   * @param {object} res - Objeto de respuesta de Express.
   */
  async getAccountSummaryById(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      const isAdmin = req.user.rol === "admin";

      let resumen;
      if (isAdmin) {
        // Opción A: Administrador (acceso total)
        resumen = await resumenCuentaService.getById(id);
      } else {
        // Opción B: Usuario (solo si es propietario)
        resumen = await resumenCuentaService.findResumenByIdAndUserId(
          id,
          userId
        );
      }

      if (!resumen) {
        // Respuesta unificada para evitar revelar si el recurso existe pero el usuario no tiene acceso
        return res.status(404).json({
          message: "Resumen de cuenta no encontrado o no autorizado.",
        });
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
   * @async
   * @function update
   * @description Actualiza un resumen de cuenta por su ID. Típicamente solo accesible por administradores.
   * @param {object} req - Objeto de solicitud de Express.
   * @param {object} res - Objeto de respuesta de Express.
   */
  async update(req, res) {
    try {
      const { id } = req.params;
      const data = req.body;
      const updatedResumen = await resumenCuentaService.update(id, data);
      if (!updatedResumen) {
        return res
          .status(404)
          .json({ message: "Resumen de cuenta no encontrado." });
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
   * @async
   * @function softDelete
   * @description Elimina lógicamente (soft delete) un resumen de cuenta por ID. Típicamente para administradores.
   * @param {object} req - Objeto de solicitud de Express.
   * @param {object} res - Objeto de respuesta de Express.
   */
  async softDelete(req, res) {
    try {
      const { id } = req.params;
      const deletedResumen = await resumenCuentaService.softDelete(id);
      if (!deletedResumen) {
        return res
          .status(404)
          .json({ message: "Resumen de cuenta no encontrado." });
      }
      res
        .status(200)
        .json({ message: "Resumen de cuenta eliminado lógicamente." });
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
