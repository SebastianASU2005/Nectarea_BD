const imagenService = require("../services/imagen.service");
const fs = require("fs");
const path = require("path");

/**
 * Controlador de Express para gestionar la subida, almacenamiento de referencia
 * y recuperación de imágenes asociadas a Proyectos y Lotes.
 */
const imagenController = {
  // ===================================================================
  // FUNCIONES DE RECUPERACIÓN POR ASOCIACIÓN (USUARIOS)
  // ===================================================================

  /**
   * @async
   * @function getImagesByProjectId
   * @description Obtiene todas las imágenes **activas** asociadas a un proyecto.
   * @param {object} req - Objeto de solicitud de Express (con `idProyecto` en `params`).
   * @param {object} res - Objeto de respuesta de Express.
   */
  async getImagesByProjectId(req, res) {
    try {
      const id_proyecto = req.params.idProyecto;
      if (!id_proyecto) {
        return res.status(400).json({ error: "ID del proyecto requerido." });
      }
      const imagenes = await imagenService.findByProjectIdActivo(id_proyecto);
      res.json(imagenes);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  /**
   * @async
   * @function getImagesByLoteId
   * @description Obtiene todas las imágenes **activas** asociadas a un lote.
   * @param {object} req - Objeto de solicitud de Express (con `idLote` en `params`).
   * @param {object} res - Objeto de respuesta de Express.
   */
  async getImagesByLoteId(req, res) {
    try {
      const id_lote = req.params.idLote;
      if (!id_lote) {
        return res.status(400).json({ error: "ID del lote requerido." });
      }
      const imagenes = await imagenService.findByLoteIdActivo(id_lote);
      res.json(imagenes);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // ===================================================================
  // NUEVA FUNCIÓN: BÚSQUEDA DE IMÁGENES SIN ASIGNAR
  // ===================================================================

  /**
   * @async
   * @function getUnassignedActiveImages
   * @description Obtiene todas las imágenes activas que no están asignadas a un proyecto ni a un lote.
   * @param {object} req - Objeto de solicitud de Express.
   * @param {object} res - Objeto de respuesta de Express.
   */
  async getUnassignedActiveImages(req, res) {
    try {
      const imagenes = await imagenService.findUnassignedActivo();
      res.json(imagenes);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // ===================================================================
  // FUNCIONES DE BÚSQUEDA POR ID
  // ===================================================================

  /**
   * @async
   * @function findById
   * @description Busca una imagen por ID (incluye eliminadas lógicamente, para administradores).
   * @param {object} req - Objeto de solicitud de Express (con `id` en `params`).
   * @param {object} res - Objeto de respuesta de Express.
   */
  async findById(req, res) {
    try {
      const imagen = await imagenService.findById(req.params.id);
      if (!imagen) {
        return res.status(404).json({ message: "Imagen no encontrada." });
      }
      res.json(imagen);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  /**
   * @async
   * @function findByIdActivo
   * @description Busca una imagen activa por ID (para usuarios).
   * @param {object} req - Objeto de solicitud de Express (con `id` en `params`).
   * @param {object} res - Objeto de respuesta de Express.
   */
  async findByIdActivo(req, res) {
    try {
      const imagen = await imagenService.findByIdActivo(req.params.id);
      if (!imagen) {
        return res
          .status(404)
          .json({ message: "Imagen no encontrada o no activa." });
      }
      res.json(imagen);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // ===================================================================
  // 🚀 FUNCIÓN DE CREACIÓN CON MANEJO DE ARCHIVOS (MULTER) 🚀
  // ===================================================================

  /**
   * @async
   * @function create
   * @description Sube la imagen y registra su URL/metadatos en la DB.
   * @param {object} req - Objeto de solicitud de Express (con `req.file` y datos en `body`).
   * @param {object} res - Objeto de respuesta de Express.
   */
  async create(req, res) {
    let uploadedFilePath = null; // Para manejo de errores

    try {
      // 1. Verificar si el middleware de Multer adjuntó el archivo
      if (!req.file) {
        return res
          .status(400)
          .json({ error: "No se subió ningún archivo de imagen." });
      }

      uploadedFilePath = req.file.path; // Ruta absoluta del archivo subido

      // 2. Construir el objeto de datos para la base de datos
      // Usamos el nombre del archivo subido para construir la URL pública.
      const publicPath = `/uploads/imagenes/${req.file.filename}`;

      const imagenData = {
        url: publicPath, // Ruta pública guardada en la DB
        descripcion: req.body.descripcion,
        id_proyecto: req.body.id_proyecto || null,
        id_lote: req.body.id_lote || null,
      };

      // Validación para asegurar que la imagen está asociada a algo (o que se permita crear imágenes sin asignar)
      // Nota: Si quieres permitir imágenes sin asignar inicialmente, elimina este bloque.
      if (!imagenData.id_proyecto && !imagenData.id_lote) {
        throw new Error(
          "La imagen debe estar asociada a un proyecto o a un lote al momento de la creación."
        );
      }

      // 3. Crear el registro en la base de datos
      const nuevaImagen = await imagenService.create(imagenData);
      res.status(201).json(nuevaImagen);
    } catch (error) {
      // 4. Si falla la DB o la validación, ELIMINAR el archivo subido por Multer
      if (uploadedFilePath) {
        try {
          fs.unlinkSync(uploadedFilePath);
        } catch (unlinkError) {
          console.error(
            `Fallo al eliminar el archivo subido: ${unlinkError.message}`
          );
        }
      }
      res.status(500).json({ error: error.message });
    }
  },

  // ===================================================================
  // FUNCIONES DE CONSULTA GENERAL
  // ===================================================================

  /**
   * @async
   * @function findAll
   * @description Obtiene todas las imágenes (incluye eliminadas lógicamente, para administradores).
   */
  async findAll(req, res) {
    try {
      const imagenes = await imagenService.findAll();
      res.json(imagenes);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  /**
   * @async
   * @function findAllActivo
   * @description Obtiene todas las imágenes activas (para usuarios).
   */
  async findAllActivo(req, res) {
    try {
      const imagenes = await imagenService.findAllActivo();
      res.json(imagenes);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // ===================================================================
  // FUNCIONES DE MODIFICACIÓN Y ELIMINACIÓN
  // ===================================================================

  /**
   * @async
   * @function update
   * @description Actualiza los metadatos de una imagen (ej. descripción, asociación).
   * @param {object} req - Objeto de solicitud de Express (con `id` en `params` y datos en `body`).
   * @param {object} res - Objeto de respuesta de Express.
   */
  async update(req, res) {
    try {
      const imagenActualizada = await imagenService.update(
        req.params.id,
        req.body
      );
      if (!imagenActualizada) {
        return res.status(404).json({ message: "Imagen no encontrada." });
      }
      res.json(imagenActualizada);
    } catch (error) {
      // Esto capturará el error de uso único del servicio
      res.status(400).json({ error: error.message });
    }
  },

  /**
   * @async
   * @function softDelete
   * @description Elimina lógicamente una imagen (la marca como inactiva).
   * @param {object} req - Objeto de solicitud de Express (con `id` en `params`).
   * @param {object} res - Objeto de respuesta de Express.
   */
  async softDelete(req, res) {
    try {
      // Nota: Aquí se debería eliminar también el archivo físico para liberar espacio.
      // (Se requiere una llamada al servicio/lógica para obtener la ruta del archivo y usar fs.unlinkSync)
      const imagenEliminada = await imagenService.softDelete(req.params.id);
      if (!imagenEliminada) {
        return res.status(404).json({ message: "Imagen no encontrada." });
      }
      res.json({ message: "Imagen eliminada lógicamente." });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
};

module.exports = imagenController;
