// services/inversion.service.js

const Inversion = require('../models/inversion');

const inversionService = {
  // Función para crear una nueva inversión
  async create(data) {
    return Inversion.create(data);
  },

  // Función para obtener TODAS las inversiones (para administradores)
  async findAll() {
    return Inversion.findAll();
  },

  // Función para encontrar TODAS las inversiones ACTIVAS (para clientes)
  async findAllActivo() {
    return Inversion.findAll({
      where: {
        activo: true
      }
    });
  },

  // Función para encontrar una inversión por su ID
  async findById(id) {
    return Inversion.findByPk(id);
  },

  // Función para actualizar una inversión
  async update(id, data) {
    const inversion = await this.findById(id);
    if (!inversion) {
      return null;
    }
    return inversion.update(data);
  },

  // Función para "eliminar" una inversión (soft delete)
  async softDelete(id) {
    const inversion = await this.findById(id);
    if (!inversion) {
      return null;
    }
    // Actualiza el campo 'activo' a false en lugar de eliminar la fila
    return inversion.update({ activo: false });
  }
};

module.exports = inversionService;