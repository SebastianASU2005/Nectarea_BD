// services/lote.service.js

const Lote = require('../models/lote');
    
const loteService = {
  // Función para crear un nuevo lote
  async create(data) {
    return Lote.create(data);
  },

  // Función para obtener TODOS los lotes (para administradores)
  async findAll() {
    return Lote.findAll();
  },

  // Función para encontrar TODOS los lotes ACTIVOS (para clientes)
  async findAllActivo() {
    return Lote.findAll({
      where: {
        activo: true
      }
    });
  },

  // Función para encontrar un lote por su ID
  async findById(id) {
    return Lote.findByPk(id);
  },

  // Función para actualizar un lote
  async update(id, data) {
    const lote = await this.findById(id);
    if (!lote) {
      return null;
    }
    return lote.update(data);
  },

  // Función para "eliminar" un lote (soft delete)
  async softDelete(id) {
    const lote = await this.findById(id);
    if (!lote) {
      return null;
    }
    // Actualiza el campo 'activo' a false en lugar de eliminar la fila
    return lote.update({ activo: false });
  }
};

module.exports = loteService;