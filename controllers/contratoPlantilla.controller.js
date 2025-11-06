// controllers/contratoPlantillaController.js

const contratoPlantillaService = require("../services/contratoPlantilla.service");
// Necesarios para manejar el archivo subido (hash y guardado)
const localFileStorageService = require("../services/localFileStorage.service");
const { formatErrorResponse } = require("../utils/responseUtils");

const contratoPlantillaController = {
  // ------------------------------------------------------------------
  // 1. FUNCIONES DE CREACIÓN Y MODIFICACIÓN (ADMIN)
  // ------------------------------------------------------------------

  /**
   * @route POST /api/contratos/plantillas/upload
   * @description Sube un nuevo archivo PDF y crea una nueva Plantilla de Contrato.
   * Requiere el middleware 'uploadPlantilla' (campo: 'plantillaFile').
   */
  async createPlantilla(req, res) {
    try {
      const id_usuario_creacion = req.user.id;
      const pdfFile = req.file;

      const {
        nombre_archivo,
        version,
        id_proyecto, // ✅ AHORA SÍ SE EXTRAE (puede ser null o un número)
      } = req.body;

      if (!pdfFile || !pdfFile.buffer) {
        return res.status(400).json({
          message:
            "No se encontró el archivo PDF para la plantilla (use el campo 'plantillaFile').",
        });
      }

      // 1. Calcular Hash
      const hash_archivo_original =
        localFileStorageService.calculateHashFromBuffer(pdfFile.buffer);

      // 2. Subir archivo
      const relativeFilePath = `plantillas/base/${nombre_archivo}-${Date.now()}.pdf`;
      const url_archivo = await localFileStorageService.uploadBuffer(
        pdfFile.buffer,
        relativeFilePath
      );

      // 3. Crear el registro
      const plantillaData = {
        nombre_archivo: nombre_archivo || pdfFile.originalname,
        url_archivo,
        hash_archivo_original,
        version: version ? parseInt(version) : 1,
        id_proyecto: id_proyecto ? parseInt(id_proyecto) : null, // ✅ CORREGIDO
        id_usuario_creacion,
      };

      const nuevaPlantilla = await contratoPlantillaService.create(
        plantillaData
      );

      return res.status(201).json({
        message: "Plantilla de contrato creada y registrada con éxito.",
        plantilla: nuevaPlantilla,
      });
    } catch (error) {
      console.error("Error al crear plantilla:", error);
      const statusCode = error.message.includes("sin proyecto asignado")
        ? 400
        : 500;
      return res.status(statusCode).json(formatErrorResponse(error.message));
    }
  },

  /**
   * @route POST /api/contratos/plantillas/update-pdf/:id
   * @description Actualiza el archivo PDF de una plantilla existente y recalcula el hash.
   * Requiere el middleware 'uploadPlantilla' (campo: 'plantillaFile').
   */
  async updatePlantillaPdf(req, res) {
    try {
      const { id } = req.params;
      const pdfFile = req.file;

      if (!pdfFile || !pdfFile.buffer) {
        return res.status(400).json({
          message:
            "No se encontró el nuevo archivo PDF para actualizar (use el campo 'plantillaFile').",
        });
      }

      // Generar una ruta única para la nueva versión del archivo
      const relativeFilePath = `plantillas/base/update-${id}-${Date.now()}.pdf`;

      const plantillaActualizada = await contratoPlantillaService.updatePdf(
        parseInt(id),
        pdfFile.buffer,
        relativeFilePath
      );

      return res.status(200).json({
        message: `PDF de la plantilla ${id} actualizado con éxito. Nuevo Hash registrado.`,
        plantilla: plantillaActualizada,
      });
    } catch (error) {
      console.error("Error al actualizar PDF de plantilla:", error);
      return res.status(500).json(formatErrorResponse(error.message));
    }
  },

  /**
   * @route PUT /api/contratos/plantillas/soft-delete/:id
   * @description Realiza el borrado lógico de una plantilla.
   */
  async softDeletePlantilla(req, res) {
    try {
      const { id } = req.params;

      await contratoPlantillaService.softDelete(parseInt(id));

      return res.status(200).json({
        message: `Plantilla con ID ${id} desactivada (borrado lógico) con éxito.`,
      });
    } catch (error) {
      console.error("Error al realizar borrado lógico:", error);
      const statusCode = error.message.includes("no existe") ? 404 : 500;
      return res.status(statusCode).json(formatErrorResponse(error.message));
    }
  },

  // ------------------------------------------------------------------
  // 2. FUNCIONES DE CONSULTA (GETs)
  // ------------------------------------------------------------------

  /**
   * @route GET /api/contratos/plantillas/all
   * @description Lista TODAS las plantillas (activas e inactivas). (Solo Admin)
   */
  async findAllPlantillas(req, res) {
    try {
      const plantillas = await contratoPlantillaService.findAll();
      return res.status(200).json(plantillas);
    } catch (error) {
      return res
        .status(500)
        .json(
          formatErrorResponse("Fallo interno al listar todas las plantillas.")
        );
    }
  },

  /**
   * @route GET /api/contratos/plantillas/unassociated
   * @description Lista todas las plantillas activas sin proyecto asignado. (Solo Admin)
   */
  async findUnassociatedPlantillas(req, res) {
    try {
      const plantillas = await contratoPlantillaService.findUnassociated();
      return res.status(200).json(plantillas);
    } catch (error) {
      return res
        .status(500)
        .json(
          formatErrorResponse("Fallo interno al listar plantillas sin asociar.")
        );
    }
  },

  /**
   * @route GET /api/contratos/plantillas/project/:idProyecto
   * @description Lista todas las versiones de plantillas activas para un proyecto específico. (Usuario/Admin)
   */
  async findPlantillasByProject(req, res) {
    try {
      const { idProyecto } = req.params;
      const plantillas = await contratoPlantillaService.findByProjectId(
        parseInt(idProyecto)
      );
      return res.status(200).json(plantillas);
    } catch (error) {
      return res
        .status(500)
        .json(
          formatErrorResponse(
            "Fallo interno al listar plantillas por proyecto."
          )
        );
    }
  },

  // ------------------------------------------------------------------
  // 3. FUNCIONES DE LECTURA DE INTEGRIDAD (MANTENIDAS)
  // ------------------------------------------------------------------

  /**
   * @route GET /api/contratos/plantilla/:idProyecto/:version
   * @description Obtiene una plantilla específica y verifica su integridad.
   */
  async getPlantillaByProjectVersion(req, res) {
    try {
      const { idProyecto, version } = req.params;

      const plantilla = await contratoPlantillaService.findByProyectoAndVersion(
        parseInt(idProyecto),
        parseInt(version)
      );

      if (!plantilla) {
        return res
          .status(404)
          .json({ message: "Plantilla no encontrada o inactiva." });
      }

      // Chequeo de seguridad: integridad del hash
      if (plantilla.dataValues.integrity_compromised) {
        console.error(
          `Acceso denegado a plantilla comprometida ID: ${plantilla.id}`
        );
        return res.status(500).json({
          message:
            "Error de seguridad: La integridad del archivo base de la plantilla está comprometida. No se puede utilizar para la firma.",
        });
      }

      return res.status(200).json(plantilla);
    } catch (error) {
      console.error("Error al obtener plantilla:", error);
      return res
        .status(500)
        .json(formatErrorResponse("Fallo interno al procesar la solicitud."));
    }
  },

  /**
   * @route GET /api/contratos/plantillas/:idProyecto (Función original)
   * @description Lista todas las versiones de plantillas activas para un proyecto.
   */
  async getAllPlantillasByProject(req, res) {
    // Reutilizamos la nueva función más clara
    return contratoPlantillaController.findPlantillasByProject(req, res);
  },
};

module.exports = contratoPlantillaController;
