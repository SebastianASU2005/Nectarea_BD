const Lote = require('../models/lote');
const Imagen = require('../models/imagen');

const loteService = {
  // Crea un nuevo lote
  async create(data) {
    return await Lote.create(data);
  },

  // Busca todos los lotes (para administradores)
  async findAll() {
    return await Lote.findAll({ include: [Imagen] });
  },

  // Busca todos los lotes que no estén eliminados (para usuarios)
  async findAllActivo() {
    return await Lote.findAll({ where: { eliminado: false }, include: [Imagen] });
  },

  // NUEVO: Busca un lote por ID (para administradores)
  async findById(id) {
    return await Lote.findByPk(id, { include: [Imagen] });
  },

  // RENOMBRADO: Busca un lote por ID, verificando que no esté eliminado (para usuarios)
  async findByIdActivo(id) {
    return await Lote.findOne({ where: { id: id, eliminado: false }, include: [Imagen] });
  },

  // Actualiza un lote por ID
  async update(id, data) {
    const lote = await Lote.findByPk(id);
    if (!lote) {
      return null;
    }
    return await lote.update(data);
  },

  // Elimina lógicamente un lote
  async softDelete(id) {
    const lote = await Lote.findByPk(id);
    if (!lote) {
      return null;
    }
    lote.eliminado = true;
    return await lote.save();
  }
};

module.exports = loteService;