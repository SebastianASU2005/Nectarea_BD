const Imagen = require('../models/imagen');

const imagenService = {
  // Crea una nueva imagen
  async create(data) {
    return await Imagen.create(data);
  },

  // Busca todas las imágenes (para administradores)
  async findAll() {
    return await Imagen.findAll();
  },

  // Busca todas las imágenes que no estén eliminadas (para usuarios)
  async findAllActivo() {
    return await Imagen.findAll({ where: { activo: true } });
  },

  // NUEVO: Busca una imagen por ID (para administradores)
  async findById(id) {
    return await Imagen.findByPk(id);
  },

  // RENOMBRADO: Busca una imagen por ID, verificando que no esté eliminada (para usuarios)
  async findByIdActivo(id) {
    return await Imagen.findOne({ where: { id: id, activo: true } });
  },

  // Actualiza una imagen por ID
  async update(id, data) {
    const imagen = await Imagen.findByPk(id);
    if (!imagen) {
      return null;
    }
    return await imagen.update(data);
  },

  // Elimina lógicamente una imagen
  async softDelete(id) {
    const imagen = await Imagen.findByPk(id);
    if (!imagen) {
      return null;
    }
    imagen.activo = false;
    return await imagen.save();
  }
};

module.exports = imagenService;