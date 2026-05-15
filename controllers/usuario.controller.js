const usuarioService = require("../services/usuario.service");
const auth2faService = require("../services/auth2fa.service");
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
  },
  /**
   * @async
   * @function confirmEmail
   * @description Maneja la ruta de confirmación de correo electrónico usando el token URL.
   * @param {object} req - Contiene el token en `req.params`.
   * @param {object} res - Objeto de respuesta de Express.
   */ async confirmEmail(req, res) {
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
  },
  /**
   * @async
   * @function findAll
   * @description Obtiene todos los usuarios (incluidos inactivos). Generalmente para administradores.
   */ async findAll(req, res) {
    try {
      const usuarios = await usuarioService.findAll();
      res.status(200).json(usuarios);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
  /**
   * @async
   * @function findAllActivo
   * @description Obtiene solo los usuarios activos.
   */ async findAllActivo(req, res) {
    try {
      const usuariosActivos = await usuarioService.findAllActivos();
      res.status(200).json(usuariosActivos);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
  /**
   * @async
   * @function findAllAdmins
   * @description 🆕 Obtiene todos los usuarios con rol de administrador activos.
   */ async findAllAdmins(req, res) {
    try {
      const administradores = await usuarioService.findAllAdmins();
      res.status(200).json(administradores);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
  /**
   * @async
   * @function findById
   * @description Encuentra un usuario por ID. Versión para administradores (accede a cualquier ID).
   */ async findById(req, res) {
    try {
      const usuario = await usuarioService.findById(req.params.id);
      if (!usuario) {
        return res.status(404).json({ error: "Usuario no encontrado" });
      }
      res.status(200).json(usuario);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
  /**
   * @async
   * @function findMe
   * @description Obtiene los datos del usuario autenticado a través de `req.user.id`.
   */ async findMe(req, res) {
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
  },

  async update(req, res) {
    try {
      const allowedAdminFields = [
        "nombre",
        "apellido",
        "email",
        "numero_telefono",
        "activo",
        "rol",
        "nombre_usuario",
        "dni",
      ];
      const filteredData = Object.keys(req.body).reduce((acc, key) => {
        if (allowedAdminFields.includes(key)) acc[key] = req.body[key];
        return acc;
      }, {});
      if (Object.keys(filteredData).length === 0) {
        return res.status(400).json({
          error: "No se proporcionaron campos válidos para la actualización.",
        });
      }

      // 🆕 Preparar contexto de administrador
      const adminContext = {
        adminId: req.user.id,
        ip: req.ip,
        userAgent: req.headers["user-agent"],
        motivo: req.body.motivo || req.body.motivo_cambio || null,
      };

      const usuarioActualizado = await usuarioService.update(
        req.params.id,
        filteredData,
        adminContext,
      );
      if (!usuarioActualizado)
        return res.status(404).json({ error: "Usuario no encontrado" });
      res.status(200).json(usuarioActualizado);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },
  /**
   * @async
   * @function updateMe
   * @description Actualiza el perfil del usuario autenticado. Solo actualiza su propio registro.
   */
  async updateMe(req, res) {
    try {
      // 🛑 Definimos los campos que un USUARIO NORMAL PUEDE cambiar.
      const allowedUserFields = [
        "nombre",
        "apellido",
        "email",
        "numero_telefono",
        "nombre_usuario", // Agregado el campo de nombre de usuario
      ];

      // Creamos un nuevo objeto solo con las propiedades permitidas.
      const filteredData = Object.keys(req.body).reduce((acc, key) => {
        // Aseguramos que NO se puedan cambiar campos sensibles como 'rol', 'DNI', 'activo', etc.
        if (allowedUserFields.includes(key)) {
          acc[key] = req.body[key];
        }
        return acc;
      }, {});

      if (Object.keys(filteredData).length === 0) {
        return res.status(400).json({
          error: "No se proporcionaron campos válidos para la actualización.",
        });
      }

      // Usa req.user.id para asegurar que solo actualiza su propio perfil
      const usuarioActualizado = await usuarioService.update(
        req.user.id,
        filteredData, // <-- Usamos los datos filtrados
      );
      if (!usuarioActualizado) {
        return res.status(404).json({ error: "Usuario no encontrado" });
      }
      res.status(200).json(usuarioActualizado);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },
  async changePassword(req, res) {
    try {
      const { currentPassword, newPassword, twofaCode } = req.body || {};

      if (!currentPassword || !newPassword) {
        return res.status(400).json({
          error: "Debes proporcionar la contraseña actual y la nueva.",
        });
      }

      await usuarioService.changePassword(
        req.user.id,
        currentPassword,
        newPassword,
        twofaCode || null,
      );

      res
        .status(200)
        .json({ message: "✅ Contraseña actualizada exitosamente." });
    } catch (error) {
      if (error.requires2fa) {
        return res.status(403).json({
          error: error.message,
          requires2fa: true,
          codeInvalid: error.codeInvalid || false,
        });
      }

      const statusCode = error.message.includes("incorrecta") ? 401 : 400;
      res.status(statusCode).json({ error: error.message });
    }
  },
  /**
   * @async
   * @function adminResetPassword
   * @description Permite a un admin establecer una nueva contraseña para un usuario.
   * (SOLO ADMIN)
   */
  async adminResetPassword(req, res) {
    try {
      const userId = parseInt(req.params.id);
      if (isNaN(userId))
        return res.status(400).json({ error: "ID de usuario inválido." });
      const { newPassword } = req.body;
      if (!newPassword)
        return res
          .status(400)
          .json({ error: "Debes proporcionar la nueva contraseña." });

      const adminContext = {
        adminId: req.user.id,
        ip: req.ip,
        userAgent: req.headers["user-agent"],
      };
      await usuarioService.adminResetPassword(
        userId,
        newPassword,
        adminContext,
      );
      res.status(200).json({
        message: `✅ Contraseña del usuario ID ${userId} actualizada exitosamente.`,
      });
    } catch (error) {
      const statusCode = error.message.includes("no encontrado") ? 404 : 400;
      res.status(statusCode).json({ error: error.message });
    }
  },
  /**
   * @async
   * @function validateDeactivation
   * @description Valida si un usuario puede desactivar su cuenta sin realmente desactivarla.
   * Útil para mostrar advertencias en el frontend antes de confirmar.
   */
  async validateDeactivation(req, res) {
    try {
      const validation = await usuarioService.validateUserDeactivation(
        req.user.id,
      );
      res.status(200).json(validation);
    } catch (error) {
      // Si hay suscripciones activas, devuelve 409 (Conflict)
      res.status(409).json({
        error: error.message,
        canDeactivate: false,
      });
    }
  },
  /**
   * @async
   * @function softDelete
   * @description "Elimina" lógicamente (soft delete) un usuario por ID. Versión para administradores.
   */
  async softDelete(req, res) {
    try {
      const adminContext = {
        adminId: req.user.id,
        ip: req.ip,
        userAgent: req.headers["user-agent"],
        motivo: req.body.motivo || req.body.motivo_cambio || null,
      };
      const usuarioEliminado = await usuarioService.softDelete(
        req.params.id,
        adminContext,
      );
      if (!usuarioEliminado)
        return res.status(404).json({ error: "Usuario no encontrado" });
      res
        .status(200)
        .json({ message: "Usuario desactivado exitosamente", success: true });
    } catch (error) {
      const statusCode = error.message.includes("suscripción") ? 409 : 500;
      res.status(statusCode).json({ error: error.message });
    }
  },

  /**
   * @async
   * @function search
   * @description Busca usuarios por coincidencia parcial en nombre_usuario o email.
   * (ACCESO SÓLO ADMIN)
   * @param {object} req - Objeto de solicitud de Express (contiene `req.query.q`).
   * @param {object} res - Objeto de respuesta de Express.
   */
  async search(req, res) {
    try {
      // El término de búsqueda se espera en el query parameter 'q'
      const searchTerm = req.query.q;

      if (!searchTerm || searchTerm.length < 3) {
        return res.status(400).json({
          error: "El término de búsqueda debe tener al menos 3 caracteres.",
        });
      }

      // Llama a la nueva función del servicio
      const usuariosEncontrados =
        await usuarioService.searchByUsername(searchTerm);

      res.status(200).json(usuariosEncontrados);
    } catch (error) {
      console.error("Error al buscar usuarios:", error.message);
      res.status(500).json({ error: "Error interno al realizar la búsqueda." });
    }
  },
  /**
   * @async
   * @function adminReset2FA
   * @description ⚠️ CRÍTICO: Permite a un administrador deshabilitar el 2FA de otro usuario.
   * DEBE estar protegida por un middleware de SOLO ADMINISTRADORES.
   * @param {object} req - Objeto de solicitud de Express (con `req.params.id`).
   * @param {object} res - Objeto de respuesta de Express.
   */
  async adminReset2FA(req, res) {
    try {
      const userIdToReset = parseInt(req.params.id);
      if (isNaN(userIdToReset))
        return res.status(400).json({ error: "ID de usuario inválido." });
      const adminContext = {
        adminId: req.user.id,
        ip: req.ip,
        userAgent: req.headers["user-agent"],
      };
      await usuarioService.adminReset2FA(userIdToReset, adminContext);
      res.status(200).json({
        message: `✅ 2FA deshabilitado para el usuario ID ${userIdToReset}.`,
      });
    } catch (error) {
      const statusCode = error.message.includes("Usuario no encontrado")
        ? 404
        : 500;
      res.status(statusCode).json({ error: error.message });
    }
  },
  /**
   * @async
   * @function prepareForReactivation
   * @description Permite a un admin cambiar email/username de una cuenta INACTIVA
   * para resolver conflictos antes de reactivarla.
   * (SOLO ADMIN)
   */
  async prepareForReactivation(req, res) {
    try {
      const userId = parseInt(req.params.id);
      if (isNaN(userId))
        return res.status(400).json({ error: "ID de usuario inválido." });
      const { email, nombre_usuario, dni } = req.body || {};
      if (!email && !nombre_usuario && !dni) {
        return res.status(400).json({
          error:
            "Debes proporcionar al menos un campo para actualizar (email, nombre_usuario o dni).",
        });
      }
      const adminContext = {
        adminId: req.user.id,
        ip: req.ip,
        userAgent: req.headers["user-agent"],
        motivo: req.body.motivo || req.body.motivo_cambio || null,
      };
      const usuarioActualizado =
        await usuarioService.prepareAccountForReactivation(
          userId,
          { email, nombre_usuario, dni },
          adminContext,
        );
      return res.status(200).json({
        message:
          "Datos actualizados exitosamente. Ahora el usuario puede reactivar su cuenta.",
        usuario: usuarioActualizado,
      });
    } catch (error) {
      const statusCode = error.message.startsWith("❌") ? 409 : 404;
      return res.status(statusCode).json({ error: error.message });
    }
  },

  /**
   * @async
   * @function reactivateAccount
   * @description Reactiva una cuenta inactiva.
   * (SOLO ADMIN)
   */
  async reactivateAccount(req, res) {
    try {
      const userId = parseInt(req.params.id);
      if (isNaN(userId))
        return res.status(400).json({ error: "ID de usuario inválido." });
      const adminContext = {
        adminId: req.user.id,
        ip: req.ip,
        userAgent: req.headers["user-agent"],
        motivo: req.body.motivo || req.body.motivo_cambio || null,
      };
      const usuarioReactivado = await usuarioService.reactivateAccount(
        userId,
        adminContext,
      );
      res.status(200).json({
        message: "✅ Cuenta reactivada exitosamente.",
        usuario: {
          id: usuarioReactivado.id,
          nombre: usuarioReactivado.nombre,
          email: usuarioReactivado.email,
          nombre_usuario: usuarioReactivado.nombre_usuario,
          activo: usuarioReactivado.activo,
        },
      });
    } catch (error) {
      const statusCode = error.message.includes("no encontrado")
        ? 404
        : error.message.includes("ya está activa")
          ? 409
          : 400;
      res.status(statusCode).json({ error: error.message });
    }
  },
  async iniciarCancelacionCuenta(req, res) {
    try {
      const userId = req.user.id;
      const user = await usuarioService.findById(userId);
      if (!user)
        return res.status(404).json({ error: "Usuario no encontrado" });

      // Usuario normal: debe tener 2FA activo
      if (!user.is_2fa_enabled || !user.twofa_secret) {
        return res.status(403).json({
          error:
            "Debes activar la verificación en dos pasos (2FA) antes de poder desactivar tu cuenta.",
        });
      }

      // Tiene 2FA → solicitar código
      return res.status(202).json({
        message: "Se requiere verificación 2FA para desactivar la cuenta.",
        requires2FA: true,
      });
    } catch (error) {
      console.error("Error en iniciarCancelacionCuenta:", error.message);
      res.status(400).json({ error: error.message });
    }
  },

  /**
   * Paso 2: Confirma la desactivación con el código 2FA.
   */
  async confirmarCancelacionCuenta(req, res) {
    try {
      const userId = req.user.id;
      const { codigo_2fa } = req.body;
      if (!codigo_2fa)
        return res.status(400).json({ error: "Falta el código 2FA." });
      const user = await usuarioService.findById(userId);
      if (!user || !user.is_2fa_enabled || !user.twofa_secret) {
        return res
          .status(403)
          .json({ error: "2FA no activo o configuración inválida." });
      }
      const isVerified = auth2faService.verifyToken(
        user.twofa_secret,
        codigo_2fa,
      );
      if (!isVerified)
        return res.status(401).json({ error: "Código 2FA incorrecto." });
      // Llamada sin adminContext (el usuario se desactiva a sí mismo)
      const usuarioDesactivado = await usuarioService.softDelete(userId);
      res
        .status(200)
        .json({ message: "Cuenta desactivada exitosamente.", success: true });
    } catch (error) {
      console.error("Error en confirmarCancelacionCuenta:", error.message);
      res.status(400).json({ error: error.message });
    }
  },
};

module.exports = usuarioController;
