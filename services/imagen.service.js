const Imagen = require("../models/imagen");
const { Op } = require("sequelize"); // Requerido para buscar por varios campos si fuera necesario, aunque aquí solo es por uno.

const imagenService = {
  // Crea una nueva imagen
  async create(data) {
    return await Imagen.create(data);
  }, // Busca todas las imágenes (para administradores)

  async findAll() {
    return await Imagen.findAll();
  }, // Busca todas las imágenes que no estén eliminadas (para usuarios)

  async findAllActivo() {
    return await Imagen.findAll({ where: { activo: true } });
  }, // NUEVO: Busca todas las imágenes activas asociadas a un proyecto

  async findByProjectIdActivo(id_proyecto) {
    return await Imagen.findAll({
      where: {
        id_proyecto: id_proyecto,
        activo: true,
      },
      order: [["id", "ASC"]], // Opcional: ordenar para una galería consistente
    });
  }, // NUEVO: Busca todas las imágenes activas asociadas a un lote

  async findByLoteIdActivo(id_lote) {
    return await Imagen.findAll({
      where: {
        id_lote: id_lote,
        activo: true,
      },
      order: [["id", "ASC"]], // Opcional: ordenar para una galería consistente
    });
  }, // Busca una imagen por ID (para administradores)

  async findById(id) {
    return await Imagen.findByPk(id);
  }, // Busca una imagen por ID, verificando que no esté eliminada (para usuarios)

  async findByIdActivo(id) {
    return await Imagen.findOne({ where: { id: id, activo: true } });
  }, // Actualiza una imagen por ID

  async update(id, data) {
    const imagen = await Imagen.findByPk(id);
    if (!imagen) {
      return null;
    }
    return await imagen.update(data);
  }, // Elimina lógicamente una imagen

  async softDelete(id) {
    const imagen = await Imagen.findByPk(id);
    if (!imagen) {
      return null;
    }
    imagen.activo = false;
    return await imagen.save();
  },
};

module.exports = imagenService;
