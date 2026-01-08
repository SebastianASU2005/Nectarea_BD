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
      // 🛑 Definimos los campos que *un administrador* PUEDE cambiar.
      // Se asume que un administrador puede cambiar más cosas que un usuario normal,
      // PERO aún queremos evitar que campos como DNI o ID se modifiquen accidentalmente.
      // Si el administrador necesita cambiar el DNI o rol, debería ser a través de una ruta más específica y controlada.
      // Por defecto, permitimos cambiar nombre, email, teléfono y el estado `activo`.
      const allowedAdminFields = [
        "nombre",
        "apellido",
        "email",
        "numero_telefono", // ✅ Debe coincidir con el modelo (antes decía 'telefono')
        "activo",
        "rol",
        "nombre_usuario",
        "dni", // ✅ Debe coincidir con el modelo (antes decía 'DNI')
      ];

      // Creamos un nuevo objeto solo con las propiedades permitidas.
      const filteredData = Object.keys(req.body).reduce((acc, key) => {
        if (allowedAdminFields.includes(key)) {
          acc[key] = req.body[key];
        }
        return acc;
      }, {});

      if (Object.keys(filteredData).length === 0) {
        return res.status(400).json({
          error: "No se proporcionaron campos válidos para la actualización.",
        });
      }

      const usuarioActualizado = await usuarioService.update(
        req.params.id,
        filteredData // <-- Usamos los datos filtrados
      );
      if (!usuarioActualizado) {
        return res.status(404).json({ error: "Usuario no encontrado" });
      }
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
        "telefono",
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
        filteredData // <-- Usamos los datos filtrados
      );
      if (!usuarioActualizado) {
        return res.status(404).json({ error: "Usuario no encontrado" });
      }
      res.status(200).json(usuarioActualizado);
    } catch (error) {
      res.status(400).json({ error: error.message });
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
        req.user.id
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
      const usuarioEliminado = await usuarioService.softDelete(req.params.id);
      if (!usuarioEliminado) {
        return res.status(404).json({ error: "Usuario no encontrado" });
      }
      res.status(200).json({
        message: "Usuario desactivado exitosamente",
        success: true,
      });
    } catch (error) {
      const statusCode = error.message.includes("suscripción") ? 409 : 500;
      res.status(statusCode).json({ error: error.message });
    }
  },
  /**
   * @async
   * @function softDeleteMe
   * @description "Elimina" lógicamente (soft delete) el perfil del usuario autenticado,
   * REQUIRIENDO 2FA si está activo.
   */
  async softDeleteMe(req, res) {
    const userId = req.user.id; // 🛑 CORRECCIÓN CLAVE: Usamos 'req.body || {}' para prevenir TypeError // Si req.body es undefined (porque no se envió un cuerpo JSON), twofaCode será undefined, lo cual es manejable.
    const { twofaCode } = req.body || {};

    try {
      // 1. Obtener el secreto 2FA del usuario
      const secret = await usuarioService.get2FASecret(userId);
      const is2FAEnabled = !!secret;

      if (is2FAEnabled) {
        // A) 2FA ACTIVO: Requiere el código
        if (!twofaCode) {
          // El frontend debe detectar este estado y pedir el código.
          return res.status(403).json({
            message:
              "Se requiere el código de Autenticación de Dos Factores (2FA) para eliminar la cuenta.",
            requires2fa: true,
          });
        } // B) 2FA ACTIVO y CÓDIGO PROPORCIONADO: Validar el código

        const isTokenValid = auth2faService.verifyToken(secret, twofaCode);

        if (!isTokenValid) {
          return res.status(403).json({
            message:
              "Código 2FA incorrecto. La eliminación de cuenta fue abortada.",
            requires2fa: true,
            codeInvalid: true,
          });
        } // Si el código es válido, se procede a la eliminación.
      } else {
        // C) 2FA INACTIVO: Procede directamente (no se necesita código)
      } // 2. Ejecutar la lógica de soft delete (validación de suscripciones + desactivación)

      const usuarioDesactivado = await usuarioService.softDelete(userId);

      if (!usuarioDesactivado) {
        return res.status(404).json({ error: "Usuario no encontrado" });
      }

      return res.status(200).json({
        message:
          "Cuenta desactivada exitosamente. Se ha enviado una notificación por email.",
        success: true,
      });
    } catch (error) {
      // Captura errores de softDelete, como tener suscripciones activas.
      const isConflict =
        error.message.includes("suscripción") ||
        error.message.includes("ya está activa");
      const statusCode = isConflict ? 409 : 500;

      console.error("Error al desactivar cuenta:", error.message);
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
      const usuariosEncontrados = await usuarioService.searchByUsername(
        searchTerm
      );

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

      if (isNaN(userIdToReset)) {
        return res.status(400).json({ error: "ID de usuario inválido." });
      } // Llama a la nueva función del servicio

      await usuarioService.adminReset2FA(userIdToReset);

      res.status(200).json({
        message: `✅ 2FA deshabilitado para el usuario ID ${userIdToReset}. El usuario deberá volver a activarlo.`,
      });
    } catch (error) {
      // Maneja el error específico de "Usuario no encontrado" (404)
      const statusCode = error.message.includes("Usuario no encontrado")
        ? 404
        : 500;

      console.error("Error al resetear 2FA por admin:", error.message);
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

      if (isNaN(userId)) {
        return res.status(400).json({ error: "ID de usuario inválido." });
      } // ✅ CAMBIO: Incluir 'dni' en la desestructuración

      const { email, nombre_usuario, dni } = req.body || {}; // ✅ CAMBIO: Validar si al menos un campo es proporcionado

      if (!email && !nombre_usuario && !dni) {
        return res.status(400).json({
          error:
            "Debes proporcionar al menos un campo para actualizar (email, nombre_usuario o dni).",
        });
      }

      const usuarioActualizado =
        await usuarioService.prepareAccountForReactivation(userId, {
          email,
          nombre_usuario,
          dni, // ✅ Agregar DNI al objeto de datos para el servicio
        });

      return res.status(200).json({
        message:
          "Datos actualizados exitosamente. Ahora el usuario puede reactivar su cuenta.",
        usuario: usuarioActualizado,
      });
    } catch (error) {
      // Se asume que el servicio lanza errores con mensajes útiles
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

      if (isNaN(userId)) {
        return res.status(400).json({ error: "ID de usuario inválido." });
      }

      const usuarioReactivado = await usuarioService.reactivateAccount(userId);

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
};

module.exports = usuarioController;
