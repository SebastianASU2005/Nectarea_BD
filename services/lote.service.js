const Lote = require('../models/lote');
const Imagen = require('../models/imagen');
const { Op } = require('sequelize');
const mensajeService = require('./mensaje.service');
const usuarioService = require('./usuario.service');
const { sequelize } = require('../config/database');

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
      where: { activo: true }, 
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
    where: { 
      id: id, 
      activo: true
    }, 
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
    lote.activo = false;
    return await lote.save();
  },


  async endAuction(id) {
  const t = await sequelize.transaction();
  const PujaService = require('./puja.service');
  const TransaccionService = require('./transaccion.service');
  const SuscripcionProyecto = require('../models/suscripcion_proyecto');

  try {
    const lote = await Lote.findByPk(id, { transaction: t });
    if (!lote) throw new Error('Lote no encontrado.');
    if (lote.estado_subasta !== 'activa') throw new Error('La subasta no está activa.');

    const pujaGanadora = await PujaService.findHighestBidForLote(id);
    
    let transaccion = null;

    // Actualiza el lote a "finalizado" independientemente de si hay una puja ganadora
    await lote.update({
      estado_subasta: 'finalizada',
      fecha_fin: new Date()
    }, { transaction: t });

    if (pujaGanadora) {
      // **Paso 1:** Asigna el ganador en el lote
      await lote.update({ id_ganador: pujaGanadora.id_usuario }, { transaction: t });
      
      // **Paso 2:** Actualiza el estado de la puja ganadora a 'ganadora_pendiente'
      await pujaGanadora.update({ estado_puja: 'ganadora_pendiente' }, { transaction: t });

      // **Paso 3:** Crea la transacción para el pago de la puja
      transaccion = await TransaccionService.create({
        tipo_transaccion: 'Puja',
        monto: pujaGanadora.monto_puja,
        id_usuario: pujaGanadora.id_usuario,
        id_proyecto: lote.id_proyecto,
        estado_transaccion: 'pendiente',
        id_puja: pujaGanadora.id 
      }, { transaction: t });
      
    }
    await t.commit();
    
    if (pujaGanadora) {
      // Devuelve tokens a los perdedores (se hace fuera de la transacción para evitar bloqueos)
      await PujaService.gestionarTokensAlFinalizar(id);
      return transaccion;
    }
    return null;

  } catch (error) {
    await t.rollback();
    throw error;
  }
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