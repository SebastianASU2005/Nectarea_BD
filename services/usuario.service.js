// services/usuario.service.js

const Usuario = require('../models/usuario');

const usuarioService = {
  // Función para crear un nuevo usuario
  async create(data) {
    return Usuario.create(data);
  },

  // Función para obtener TODOS los usuarios (para administradores)
  async findAll() {
    return Usuario.findAll();
  },

  // Función para encontrar TODOS los usuarios ACTIVOS (para clientes)
  async findAllActivo() {
    return Usuario.findAll({
      where: {
        activo: true
      }
    });
  },

  // Función para encontrar un usuario por su ID
  async findById(id) {
    return Usuario.findByPk(id);
  },

  // Función para actualizar un usuario
  async update(id, data) {
    const usuario = await this.findById(id);
    if (!usuario) {
      return null;
    }
    return usuario.update(data);
  },

  // Función para "eliminar" un usuario (soft delete)
  async softDelete(id) {
    const usuario = await this.findById(id);
    if (!usuario) {
      return null;
    }
    // Actualiza el campo 'activo' a false en lugar de eliminar la fila
    return usuario.update({ activo: false });
  }
};

module.exports = usuarioService;