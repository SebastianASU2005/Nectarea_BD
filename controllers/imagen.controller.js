const imagenService = require("../services/imagen.service");
const storageService = require("../services/storage");
const path = require("path"); // ✅ importación añadida

const imagenController = {
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

  async getUnassignedActiveImages(req, res) {
    try {
      const imagenes = await imagenService.findUnassignedActivo();
      res.json(imagenes);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

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

  async create(req, res) {
    let relativePath = null; // ✅ declarada fuera del try
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No se subió ningún archivo." });
      }

      const fileExtension = path.extname(req.file.originalname);
      const fileName = `img_${Date.now()}${fileExtension}`;
      relativePath = `imagenes/${req.body.id_proyecto ? `proyectos/${req.body.id_proyecto}` : `lotes/${req.body.id_lote}`}/${fileName}`;
      const url = await storageService.saveFile(req.file.buffer, relativePath);

      const imagenData = {
        url,
        descripcion: req.body.descripcion,
        id_proyecto: req.body.id_proyecto || null,
        id_lote: req.body.id_lote || null,
      };
      if (!imagenData.id_proyecto && !imagenData.id_lote) {
        throw new Error("La imagen debe estar asociada a un proyecto o lote.");
      }
      const nuevaImagen = await imagenService.create(imagenData);
      res.status(201).json(nuevaImagen);
    } catch (error) {
      if (relativePath) {
        await storageService.deleteFile(relativePath).catch(() => {});
      }
      res.status(500).json({ error: error.message });
    }
  },

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
        req.body,
      );
      if (!imagenActualizada) {
        return res.status(404).json({ message: "Imagen no encontrada." });
      }
      res.json(imagenActualizada);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  async softDelete(req, res) {
    try {
      const imagen = await imagenService.findById(req.params.id);
      if (!imagen) {
        return res.status(404).json({ message: "Imagen no encontrada." });
      }
      await storageService.deleteFile(imagen.url);
      const imagenEliminada = await imagenService.softDelete(req.params.id);
      res.json({ message: "Imagen eliminada lógicamente y archivo removido." });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
};

module.exports = imagenController;
