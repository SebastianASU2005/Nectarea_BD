// services/imagen.service.js

const Imagen = require('../models/imagen');

const imagenService = {
  // Función para crear una nueva imagen
  async create(data) {
    return Imagen.create(data);
  },

  // Función para obtener TODAS las imágenes (para administradores)
  async findAll() {
    return Imagen.findAll();
  },

  // Función para encontrar TODAS las imágenes ACTIVAS (para clientes)
  async findAllActivo() {
    return Imagen.findAll({
      where: {
        activo: true
      }
    });
  },

  // Función para encontrar una imagen por su ID
  async findById(id) {
    return Imagen.findByPk(id);
  },

  // Función para actualizar una imagen
  async update(id, data) {
    const imagen = await this.findById(id);
    if (!imagen) {
      return null;
    }
    return imagen.update(data);
  },

  // Función para "eliminar" una imagen (soft delete)
  async softDelete(id) {
    const imagen = await this.findById(id);
    if (!imagen) {
      return null;
    }
    // Actualiza el campo 'activo' a false en lugar de eliminar la fila
    return imagen.update({ activo: false });
  }
};

module.exports = imagenService;