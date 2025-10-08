const usuarioService = require("../services/usuario.service");

const usuarioController = {
  // Controlador para crear un nuevo usuario
  async create(req, res) {
    try {
      const nuevoUsuario = await usuarioService.create(req.body);

      // 🛑 CAMBIO CLAVE: Ocultar datos sensibles en la respuesta.
      // Creamos un objeto limpio para el frontend.
      const usuarioPublico = {
        id: nuevoUsuario.id,
        nombre: nuevoUsuario.nombre,
        apellido: nuevoUsuario.apellido,
        email: nuevoUsuario.email,
        rol: nuevoUsuario.rol,
        // No devolvemos contraseña_hash, confirmacion_token, etc.
      };

      res.status(201).json(usuarioPublico);
    } catch (error) {
      // Si el error viene de la validación (ej: email/DNI duplicado), devuelve 400
      res.status(400).json({ error: error.message });
    }
  }, // 🚀 NUEVO CONTROLADOR: Maneja la confirmación del correo electrónico

  async confirmEmail(req, res) {
    try {
      const { token } = req.params;
      await usuarioService.confirmEmail(token); // Llama al servicio que verifica y actualiza la BD // Envía una respuesta de éxito. En producción, esto debería redirigir a una página de login.

      res.status(200).json({
        mensaje:
          "¡Correo electrónico confirmado exitosamente! Ahora puede iniciar sesión.",
      });
    } catch (error) {
      // Si el token es inválido o expiró
      res.status(400).json({ error: error.message });
    }
  }, // Controlador para obtener todos los usuarios (para administradores)

  async findAll(req, res) {
    try {
      const usuarios = await usuarioService.findAll();
      res.status(200).json(usuarios);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }, // Nuevo controlador para obtener solo los usuarios activos (para clientes)

  async findAllActivo(req, res) {
    try {
      const usuariosActivos = await usuarioService.findAllActivo();
      res.status(200).json(usuariosActivos);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }, // Controlador para encontrar un usuario por ID (versión para administradores)

  async findById(req, res) {
    try {
      const usuario = await usuarioService.findById(req.params.id);
      if (!usuario) {
        return res.status(404).json({ error: "Usuario no encontrado" });
      }
      res.status(200).json(usuario);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }, // **NUEVO** - Obtiene los datos del usuario autenticado

  async findMe(req, res) {
    try {
      const usuario = await usuarioService.findById(req.user.id);
      if (!usuario) {
        return res.status(404).json({ error: "Usuario no encontrado" });
      }
      res.status(200).json(usuario);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }, // Controlador para actualizar un usuario (versión para administradores)

  async update(req, res) {
    try {
      const usuarioActualizado = await usuarioService.update(
        req.params.id,
        req.body
      );
      if (!usuarioActualizado) {
        return res.status(404).json({ error: "Usuario no encontrado" });
      }
      res.status(200).json(usuarioActualizado);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }, // **NUEVO** - Actualizar el perfil del usuario autenticado

  async updateMe(req, res) {
    try {
      const usuarioActualizado = await usuarioService.update(
        req.user.id,
        req.body
      );
      if (!usuarioActualizado) {
        return res.status(404).json({ error: "Usuario no encontrado" });
      }
      res.status(200).json(usuarioActualizado);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }, // Controlador para "eliminar" un usuario (soft delete) (versión para administradores)

  async softDelete(req, res) {
    try {
      const usuarioEliminado = await usuarioService.softDelete(req.params.id);
      if (!usuarioEliminado) {
        return res.status(404).json({ error: "Usuario no encontrado" });
      }
      res.status(204).send(); // 204 No Content para una eliminación exitosa
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }, // **NUEVO** - Eliminar el perfil del usuario autenticado

  async softDeleteMe(req, res) {
    try {
      const usuarioEliminado = await usuarioService.softDelete(req.user.id);
      if (!usuarioEliminado) {
        return res.status(404).json({ error: "Usuario no encontrado" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
};

module.exports = usuarioController;
