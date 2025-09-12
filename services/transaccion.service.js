// services/transaccion.service.js

const Transaccion = require('../models/transaccion');

const transaccionService = {
  // Función para crear una nueva transacción
  async create(data) {
    return Transaccion.create(data);
  },

  // Función para obtener TODAS las transacciones (para administradores)
  async findAll() {
    return Transaccion.findAll();
  },

  // Función para encontrar TODAS las transacciones ACTIVAS (para clientes)
  async findAllActivo() {
    return Transaccion.findAll({
      where: {
        activo: true
      }
    });
  },

  // Función para encontrar una transacción por su ID
  async findById(id) {
    return Transaccion.findByPk(id);
  },

  // Función para actualizar una transacción
  async update(id, data) {
    const transaccion = await this.findById(id);
    if (!transaccion) {
      return null;
    }
    return transaccion.update(data);
  },

  // Función para "eliminar" una transacción (soft delete)
  async softDelete(id) {
    const transaccion = await this.findById(id);
    if (!transaccion) {
      return null;
    }
    // Actualiza el campo 'activo' a false
    return transaccion.update({ activo: false });
  }
};

module.exports = transaccionService;