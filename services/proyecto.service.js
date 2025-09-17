  const Proyecto = require("../models/proyecto");
  const Lote = require("../models/lote");
  const Imagen = require("../models/imagen");
  const Inversion = require("../models/inversion");

  const proyectoService = {
    // Crea un nuevo proyecto y asocia los lotes
    async create(projectData, lotesIds) {
      const nuevoProyecto = await Proyecto.create(projectData);
      if (lotesIds && lotesIds.length > 0) {
        const lotes = await Lote.findAll({ where: { id: lotesIds } });
        await nuevoProyecto.addLotes(lotes);
      }
      return nuevoProyecto;
    },

    // Obtiene todos los proyectos (para administradores)
    async findAll() {
      return await Proyecto.findAll({ 
        include: [
          { model: Lote, as: 'lotes' }, // CORRECCIÓN: Se usa el alias 'lotes'
          { model: Imagen, as: 'imagenes' } // CORRECCIÓN: Se usa el alias 'imagenes'
        ]
      });
    },

    // Obtiene los proyectos activos (para usuarios)
    async findAllActivo() {
      return await Proyecto.findAll({
        where: { eliminado: false },
        include: [
          { model: Lote, as: 'lotes' }, // CORRECCIÓN: Se usa el alias 'lotes'
          { model: Imagen, as: 'imagenes' } // CORRECCIÓN: Se usa el alias 'imagenes'
        ],
      });
    },

    // NUEVO: Obtiene un proyecto por ID (para administradores)
    async findById(id) {
      return await Proyecto.findByPk(id, { 
        include: [
          { model: Lote, as: 'lotes' }, // CORRECCIÓN: Se usa el alias 'lotes'
          { model: Imagen, as: 'imagenes' } // CORRECCIÓN: Se usa el alias 'imagenes'
        ] 
      });
    },

    // RENOMBRADO: Obtiene un proyecto por ID, verificando que no esté eliminado (para usuarios)
    async findByIdActivo(id) {
      return await Proyecto.findOne({
        where: { id: id, eliminado: false },
        include: [
          { model: Lote, as: 'lotes' }, // CORRECCIÓN: Se usa el alias 'lotes'
          { model: Imagen, as: 'imagenes' } // CORRECCIÓN: Se usa el alias 'imagenes'
        ],
      });
    },

    // Busca proyectos por el ID de un usuario
    async findByUserId(userId) {
      return await Proyecto.findAll({
        include: [
          {
            model: Inversion,
            where: { id_inversor: userId },
            required: true,
          },
          { model: Lote, as: 'lotes' }, // CORRECCIÓN: Se usa el alias 'lotes'
          { model: Imagen, as: 'imagenes' }, // CORRECCIÓN: Se usa el alias 'imagenes'
        ],
        where: { eliminado: false },
      });
    },

    // Actualiza un proyecto
    async update(id, data) {
      const proyecto = await Proyecto.findByPk(id);
      if (!proyecto) {
        return null;
      }
      return await proyecto.update(data);
    },

    // Elimina lógicamente un proyecto
    async softDelete(id) {
      const proyecto = await Proyecto.findByPk(id);
      if (!proyecto) {
        return null;
      }
      proyecto.eliminado = true;
      return await proyecto.save();
    },
  };

  module.exports = proyectoService;
