const Usuario = require('../models/usuario');

const usuarioService = {
  // Función para crear un nuevo usuario
  async create(data) {
    return Usuario.create(data);
  },

  // Función para encontrar un usuario por su nombre de usuario
  async findByUsername(nombre_usuario) {
    return Usuario.findOne({
      where: {
        nombre_usuario: nombre_usuario,
      },
    });
  },

  // Función para encontrar un usuario por su token de confirmación
  async findByConfirmationToken(token) {
    return Usuario.findOne({
      where: {
        confirmacion_token: token,
      },
    });
  },

  // Obtiene todos los usuarios
  async findAll() {
    return Usuario.findAll();
  },

  // Obtiene un usuario por su ID
  async findById(id) {
    return Usuario.findByPk(id);
  },

  // Actualiza un usuario
  async update(id, data) {
    const usuario = await this.findById(id);
    if (!usuario) {
      return null;
    }
    return usuario.update(data);
  },

  // "Elimina" un usuario (soft delete)
  async softDelete(id) {
    const usuario = await this.findById(id);
    if (!usuario) {
      return null;
    }
    return usuario.update({ activo: false });
  },

  // **NUEVO**: Obtiene todos los usuarios activos
  async findAllActivos() {
    return Usuario.findAll({ where: { activo: true } });
  }
};

module.exports = usuarioService;