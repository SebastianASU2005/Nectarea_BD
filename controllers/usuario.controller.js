// controllers/usuario.controller.js

const usuarioService = require('../services/usuario.service');

const usuarioController = {
  // Controlador para crear un nuevo usuario
  async create(req, res) {
    try {
      const nuevoUsuario = await usuarioService.create(req.body);
      res.status(201).json(nuevoUsuario);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  // Controlador para obtener todos los usuarios (para administradores)
  async findAll(req, res) {
    try {
      const usuarios = await usuarioService.findAll();
      res.status(200).json(usuarios);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // Nuevo controlador para obtener solo los usuarios activos (para clientes)
  async findAllActivo(req, res) {
    try {
      const usuariosActivos = await usuarioService.findAllActivo();
      res.status(200).json(usuariosActivos);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // Controlador para encontrar un usuario por ID
  async findById(req, res) {
    try {
      const usuario = await usuarioService.findById(req.params.id);
      if (!usuario) {
        return res.status(404).json({ error: 'Usuario no encontrado' });
      }
      res.status(200).json(usuario);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // Controlador para actualizar un usuario
  async update(req, res) {
    try {
      const usuarioActualizado = await usuarioService.update(req.params.id, req.body);
      if (!usuarioActualizado) {
        return res.status(404).json({ error: 'Usuario no encontrado' });
      }
      res.status(200).json(usuarioActualizado);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  // Controlador para "eliminar" un usuario (soft delete)
  async softDelete(req, res) {
    try {
      const usuarioEliminado = await usuarioService.softDelete(req.params.id);
      if (!usuarioEliminado) {
        return res.status(404).json({ error: 'Usuario no encontrado' });
      }
      res.status(204).send(); // 204 No Content para una eliminación exitosa
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
};

module.exports = usuarioController;