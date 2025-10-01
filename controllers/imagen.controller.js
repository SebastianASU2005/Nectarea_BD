const imagenService = require("../services/imagen.service");

const imagenController = {
  // NUEVO: Obtiene todas las imágenes activas de un proyecto
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
  }, // NUEVO: Obtiene todas las imágenes activas de un lote

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
  }, // Para administradores: // Busca una imagen por ID (sin importar si está eliminada)

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
  }, // Para usuarios: // Busca una imagen activa por ID

  async findByIdActivo(req, res) {
    try {
      const imagen = await imagenService.findByIdActivo(req.params.id);
      if (!imagen) {
        return res.status(404).json({ message: "Imagen no encontrada." });
      }
      res.json(imagen);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }, // ------------------------------------------------------------------- // *** MÉTODO CREATE ACTUALIZADO PARA MANEJAR LA SUBIDA DE ARCHIVOS *** // -------------------------------------------------------------------

  async create(req, res) {
    try {
      // 1. Verificar si el middleware de Multer adjuntó el archivo
      if (!req.file) {
        return res
          .status(400)
          .json({ error: "No se subió ningún archivo de imagen." });
      } // 2. Construir el objeto de datos para la base de datos // req.file.path contiene la ruta absoluta donde Multer guardó el archivo

      const imagenData = {
        // Utilizamos req.file.path que fue guardado por el middleware en la carpeta /uploads/imagenes
        url: req.file.path,
        descripcion: req.body.descripcion,
        id_proyecto: req.body.id_proyecto || null, // Se recibe del cuerpo del formulario (form-data)
        id_lote: req.body.id_lote || null, // Se recibe del cuerpo del formulario (form-data)
      }; // Validación básica para asegurar que está asociado a algo

      if (!imagenData.id_proyecto && !imagenData.id_lote) {
        // En un entorno real, aquí eliminarías el archivo que Multer ya guardó
        return res
          .status(400)
          .json({
            error: "La imagen debe estar asociada a un proyecto o a un lote.",
          });
      } // 3. Crear el registro en la base de datos

      const nuevaImagen = await imagenService.create(imagenData);
      res.status(201).json(nuevaImagen);
    } catch (error) {
      // Manejar errores de Multer o de la base de datos
      res.status(500).json({ error: error.message });
    }
  }, // El resto de los controladores existentes:
  async findAll(req, res) {
    try {
      const imagenes = await imagenService.findAll();
      res.json(imagenes);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async findAllActivo(req, res) {
    try {
      const imagenes = await imagenService.findAllActivo();
      res.json(imagenes);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

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
      res.status(500).json({ error: error.message });
    }
  },

  async softDelete(req, res) {
    try {
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
