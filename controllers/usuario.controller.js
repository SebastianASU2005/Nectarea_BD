const usuarioService = require("../services/usuario.service");

/**
 * Controlador de Express para manejar las peticiones HTTP relacionadas con el modelo Usuario.
 * Actúa como la capa entre la solicitud y la lógica de negocio (service).
 */
const usuarioController = {
  /**
   * @async
   * @function create
   * @description Crea un nuevo usuario y devuelve una representación pública
   * del mismo (ocultando datos sensibles como hashes de contraseña y tokens).
   * @param {object} req - Objeto de solicitud de Express.
   * @param {object} res - Objeto de respuesta de Express.
   */
  async create(req, res) {
    try {
      const nuevoUsuario = await usuarioService.create(req.body); // 🛑 Ocultar datos sensibles antes de enviarlos al cliente.

      const usuarioPublico = {
        id: nuevoUsuario.id,
        nombre: nuevoUsuario.nombre,
        apellido: nuevoUsuario.apellido,
        email: nuevoUsuario.email,
        rol: nuevoUsuario.rol, // No se devuelven campos como contraseña_hash, twofa_secret, etc.
      };

      res.status(201).json(usuarioPublico);
    } catch (error) {
      // Maneja errores del servicio (ej: validación, email/DNI duplicado)
      res.status(400).json({ error: error.message });
    }
  }
  /**
   * @async
   * @function confirmEmail
   * @description Maneja la ruta de confirmación de correo electrónico usando el token URL.
   * @param {object} req - Contiene el token en `req.params`.
   * @param {object} res - Objeto de respuesta de Express.
   */,

  async confirmEmail(req, res) {
    try {
      const { token } = req.params; // Llama al servicio que verifica y actualiza la BD
      await usuarioService.confirmEmail(token); // Respuesta de éxito (en un entorno real, podría redirigir al login)

      res.status(200).json({
        mensaje:
          "¡Correo electrónico confirmado exitosamente! Ahora puede iniciar sesión.",
      });
    } catch (error) {
      // Si el token es inválido o expiró
      res.status(400).json({ error: error.message });
    }
  }
  /**
   * @async
   * @function findAll
   * @description Obtiene todos los usuarios (incluidos inactivos). Generalmente para administradores.
   */,

  async findAll(req, res) {
    try {
      const usuarios = await usuarioService.findAll();
      res.status(200).json(usuarios);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
  /**
   * @async
   * @function findAllActivo
   * @description Obtiene solo los usuarios activos.
   */,

  async findAllActivo(req, res) {
    try {
      const usuariosActivos = await usuarioService.findAllActivos();
      res.status(200).json(usuariosActivos);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
  /**
   * @async
   * @function findAllAdmins
   * @description 🆕 Obtiene todos los usuarios con rol de administrador activos.
   */,

  async findAllAdmins(req, res) {
    try {
      const administradores = await usuarioService.findAllAdmins();
      res.status(200).json(administradores);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
  /**
   * @async
   * @function findById
   * @description Encuentra un usuario por ID. Versión para administradores (accede a cualquier ID).
   */,

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
  }
  /**
   * @async
   * @function findMe
   * @description Obtiene los datos del usuario autenticado a través de `req.user.id`.
   */,

  async findMe(req, res) {
    try {
      // req.user.id es inyectado por el middleware de autenticación (JWT)
      const usuario = await usuarioService.findById(req.user.id);
      if (!usuario) {
        // En teoría, esto no debería ocurrir si el JWT es válido
        return res.status(404).json({ error: "Usuario no encontrado" });
      }
      res.status(200).json(usuario);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
  /**
   * @async
   * @function update
   * @description Actualiza un usuario por ID. Versión para administradores (actualiza cualquier ID).
   */,

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
  }
  /**
   * @async
   * @function updateMe
   * @description Actualiza el perfil del usuario autenticado. Solo actualiza su propio registro.
   */,

  async updateMe(req, res) {
    try {
      // Usa req.user.id para asegurar que solo actualiza su propio perfil
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
  }
  /**
   * @async
   * @function softDelete
   * @description "Elimina" lógicamente (soft delete) un usuario por ID. Versión para administradores.
   */,

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
  }
  /**
   * @async
   * @function softDeleteMe
   * @description "Elimina" lógicamente (soft delete) el perfil del usuario autenticado.
   */,

  async softDeleteMe(req, res) {
    try {
      // Usa req.user.id para asegurar que solo elimina su propio perfil
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
