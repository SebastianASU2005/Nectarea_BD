const Lote = require('../models/lote');
const Imagen = require('../models/imagen');
const { Op } = require('sequelize');
const mensajeService = require('./mensaje.service');
const usuarioService = require('./usuario.service');

const loteService = {
  // Crea un nuevo lote
  async create(data) {
    return await Lote.create(data);
  },

  // Busca todos los lotes (para administradores)
  async findAll() {
    return await Lote.findAll({ 
      include: [{ model: Imagen, as: 'imagenes' }]
    });
  },

  // Busca todos los lotes que no estén eliminados (para usuarios)
  async findAllActivo() {
    return await Lote.findAll({ 
      where: { eliminado: false }, 
      include: [{ model: Imagen, as: 'imagenes' }]
    });
  },

  // Busca un lote por ID (para administradores)
  async findById(id) {
    return await Lote.findByPk(id, { 
      include: [{ model: Imagen, as: 'imagenes' }]
    });
  },

  // Busca un lote por ID, verificando que no esté eliminado (para usuarios)
  async findByIdActivo(id) {
    return await Lote.findOne({ 
      where: { id: id, eliminado: false }, 
      include: [{ model: Imagen, as: 'imagenes' }]
    });
  },

  // Actualiza un lote por ID
  async update(id, data) {
    const lote = await Lote.findByPk(id);
    if (!lote) {
      return null;
    }

    // AHORA SÍ: Guardamos el estado original antes de actualizar el objeto
    const estadoOriginal = lote.estado_subasta;

    const loteActualizado = await lote.update(data);
    
    // El mensaje se enviará si el nuevo estado es 'activa' Y el estado original NO era 'activa'
    if (loteActualizado.estado_subasta === 'activa' && estadoOriginal !== 'activa') {
      const todosLosUsuarios = await usuarioService.findAllActivos();
      const remitente_id = 1;

      if (todosLosUsuarios.length > 1) {
        const contenido = `¡Subasta activa! El lote con ID ${loteActualizado.id} está ahora en subasta. ¡Revisa los detalles!`;
        
        for (const usuario of todosLosUsuarios) {
          if (usuario.id !== remitente_id) {
            await mensajeService.crear({
              id_remitente: remitente_id,
              id_receptor: usuario.id,
              contenido: contenido
            });
          }
        }
      }
    }

    return loteActualizado;
  },

  // Elimina lógicamente un lote
  async softDelete(id) {
    const lote = await Lote.findByPk(id);
    if (!lote) {
      return null;
    }
    lote.eliminado = true;
    return await lote.save();
  },

  // Asocia un conjunto de lotes a un proyecto
  async updateLotesProyecto(lotesIds, idProyecto, transaction) {
    return Lote.update(
      { id_proyecto: idProyecto },
      {
        where: { id: { [Op.in]: lotesIds } },
        transaction
      }
    );
  }
};

module.exports = loteService;