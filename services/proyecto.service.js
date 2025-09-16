const Proyecto = require("../models/proyecto");
const Imagen = require("../models/imagen");
const Lote = require("../models/lote");

const proyectoService = {
  // Función para crear un nuevo proyecto y asociar lotes existentes por sus IDs
  async create(projectData, lotesIds) {
    // 1. Crea el nuevo proyecto
    const nuevoProyecto = await Proyecto.create(projectData); // 2. Si se proporcionaron IDs de lotes, los asociamos al proyecto

    if (lotesIds && lotesIds.length > 0) {
      await Lote.update(
        { id_proyecto: nuevoProyecto.id },
        { where: { id: lotesIds } }
      );
    } // 3. Devolvemos el proyecto completo, incluyendo los lotes para confirmar
    const proyectoConLotes = await this.findById(nuevoProyecto.id);
    return proyectoConLotes;
  },

  async findAll() {
    return Proyecto.findAll({
      include: [
        {
          model: Imagen,
          as: "imagenes",
        },
        {
          model: Lote,
          as: "lotes",
        },
      ],
    });
  },

  async findAllActivo() {
    return Proyecto.findAll({
      where: {
        activo: true,
      },
      include: [
        {
          model: Imagen,
          as: "imagenes",
        },
        {
          model: Lote,
          as: "lotes",
        },
      ],
    });
  },
   async findByUserId(userId) {
    return Proyecto.findAll({
      where: {
        usuario_id: userId, // Asume que tu modelo tiene un campo 'usuario_id'
        activo: true
      },
    });
  },

  async findById(id) {
    return Proyecto.findByPk(id, {
      include: [
        {
          model: Imagen,
          as: "imagenes",
        },
        {
          model: Lote,
          as: "lotes",
        },
      ],
    });
  },

  async update(id, data) {
    const proyecto = await this.findById(id);
    if (!proyecto) {
      return null;
    }
    return proyecto.update(data);
  },

  async softDelete(id) {
    const proyecto = await this.findById(id);
    if (!proyecto) {
      return null;
    }
    return proyecto.update({ activo: false });
  },
};

module.exports = proyectoService;
