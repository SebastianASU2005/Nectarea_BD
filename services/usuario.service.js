// Archivo: services/usuario.service.js (CORREGIDO)

const Usuario = require("../models/usuario");
const { Op } = require("sequelize");
const emailService = require("./email.service");
const crypto = require("crypto");
// 🛑 IMPORTACIONES FALTANTES PARA validateUserDeactivation
const SuscripcionProyecto = require("../models/suscripcion_proyecto"); // 🛑
const Puja = require("../models/puja"); // 🛑
const ContratoFirmado = require("../models/ContratoFirmado"); // 🛑

/**
 * @function generateToken
 * @description Genera un token hexadecimal aleatorio y seguro.
 * @returns {string} Token aleatorio de 40 caracteres.
 */
const generateToken = () => {
  return crypto.randomBytes(20).toString("hex");
};

/**
 * Servicio de lógica de negocio para la gestión de usuarios.
 */
const usuarioService = {
  /**
   * @async
   * @function create
   * @description Crea un nuevo usuario y envía el email de confirmación.
   * @param {Object} data - Datos del nuevo usuario.
   * @returns {Promise<Usuario>} El objeto Usuario recién creado.
   */
  async create(data) {
    const token = generateToken(); // Establece la expiración del token a 24 horas.
    const expiracion = new Date();
    expiracion.setHours(expiracion.getHours() + 24);

    const dataConToken = {
      ...data,
      confirmacion_token: token,
      confirmacion_token_expiracion: expiracion,
      confirmado_email: false, // Por defecto, el email no está confirmado.
    };

    const nuevoUsuario = await Usuario.create(dataConToken); // Intenta enviar el email de confirmación de forma asíncrona.

    try {
      await emailService.sendConfirmationEmail(nuevoUsuario, token);
    } catch (e) {
      // Registra el error si falla el envío, pero el registro del usuario ya se completó.
      console.error(
        `ERROR: Fallo al enviar el email de confirmación a ${nuevoUsuario.email}.`,
        e,
      );
    }

    return nuevoUsuario;
  }, // 🚨 COMA AGREGADA AQUÍ
  /**
   * @async
   * @function confirmEmail
   * @description Procesa el token y marca el email del usuario como confirmado si es válido.
   * @param {string} token - Token de confirmación proporcionado por el usuario.
   * @returns {Promise<Usuario>} El usuario actualizado.
   * @throws {Error} Si el token es inválido o expirado.
   */
  async confirmEmail(token) {
    // Busca un usuario que coincida con el token y cuya expiración no haya pasado.
    const usuario = await Usuario.findOne({
      where: {
        confirmacion_token: token,
        confirmacion_token_expiracion: { [Op.gt]: new Date() }, // Mayor que la fecha y hora actual
      },
    });

    if (!usuario) {
      throw new Error("Token de confirmación inválido o expirado.");
    } // Actualiza el usuario para marcar como confirmado y limpiar los tokens.

    return usuario.update({
      confirmado_email: true,
      activo: true,
      confirmacion_token: null,
      confirmacion_token_expiracion: null,
    });
  }, // 🚨 COMA AGREGADA AQUÍ
  /**
   * @async
   * @function resendConfirmationEmail
   * @description Genera un nuevo token y reenvía el email de confirmación.
   * @param {string} email - Correo electrónico del usuario.
   * @returns {Promise<boolean>} True si el reenvío fue exitoso.
   * @throws {Error} Si el usuario ya está confirmado o hay un error de envío.
   */
  async resendConfirmationEmail(email) {
    const usuario = await Usuario.findOne({ where: { email } }); // Mensaje genérico para evitar enumeración de usuarios.

    if (!usuario) {
      throw new Error(
        "Si la cuenta existe, recibirá un correo electrónico pronto.",
      );
    }

    if (usuario.confirmado_email) {
      throw new Error("Su cuenta ya ha sido confirmada.");
    } // Genera y establece el nuevo token de expiración a 24 horas.

    const nuevoToken = generateToken();
    const expiracion = new Date();
    expiracion.setHours(expiracion.getHours() + 24);

    await usuario.update({
      confirmacion_token: nuevoToken,
      confirmacion_token_expiracion: expiracion,
    });

    try {
      await emailService.sendConfirmationEmail(usuario, nuevoToken);
      return true;
    } catch (e) {
      console.error("Error al reenviar email de confirmación:", e);
      throw new Error("Error al enviar el correo. Intente de nuevo más tarde.");
    }
  }, // 🚨 COMA AGREGADA AQUÍ
  /**
   * @async
   * @function generatePasswordResetToken
   * @description Genera un token seguro para restablecer contraseña y lo guarda en el usuario.
   * @param {string} email - Correo electrónico del usuario.
   * @returns {Promise<string|undefined>} El token de restablecimiento si el usuario existe, o undefined.
   */
  async generatePasswordResetToken(email) {
    const user = await Usuario.findOne({ where: { email } });

    if (!user) {
      return; // Silenciosamente ignora si el usuario no existe (seguridad).
    } // Genera el token y lo establece con una expiración de 1 hora.

    const resetToken = crypto.randomBytes(20).toString("hex");
    const expirationDate = new Date();
    expirationDate.setHours(expirationDate.getHours() + 1);

    await user.update({
      reset_password_token: resetToken,
      reset_password_expires: expirationDate,
    }); // 🔔 CAMBIO NECESARIO: Enviar el email de restablecimiento

    try {
      await emailService.sendPasswordResetEmail(user, resetToken);
    } catch (e) {
      // Se registra el error, pero la operación de DB ya está completa
      console.error(
        `ERROR: Fallo al enviar el email de restablecimiento a ${user.email}.`,
        e,
      );
    }

    return resetToken;
  }, // 🚨 COMA AGREGADA AQUÍ
  /**
   * @async
   * @function findByResetToken
   * @description Busca un usuario por el token de restablecimiento y verifica su expiración.
   * @param {string} token - Token de restablecimiento.
   * @returns {Promise<Usuario|null>} Usuario si es válido y no ha expirado.
   */
  async findByResetToken(token) {
    // Busca un usuario que coincida con el token y cuya expiración no haya pasado.
    const user = await Usuario.findOne({
      where: {
        reset_password_token: token,
        reset_password_expires: { [Op.gt]: new Date() },
      },
    });
    return user;
  }, // 🚨 COMA AGREGADA AQUÍ
  /**
   * @async
   * @function findByUsernameOrEmail
   * @description Encuentra un usuario por su nombre de usuario O su email.
   * @param {string} identifier - El nombre de usuario o el email ingresado.
   * @returns {Promise<Usuario|null>}
   */
  async findByUsernameOrEmail(identifier) {
    return Usuario.findOne({
      where: {
        activo: true,
        [Op.or]: [{ nombre_usuario: identifier }, { email: identifier }],
      },
    });
  },
  /**
   * @async
   * @function findByEmail
   * @description Encuentra un usuario por su email.
   * @param {string} email
   * @returns {Promise<Usuario|null>}
   */
  async findByEmail(email) {
    return Usuario.findOne({
      where: {
        email: email,
        activo: true, // 🚨 FILTRO AÑADIDO: Solo cuentas activas
      },
    });
  },
  /**
   * @async
   * @function findByUsername
   * @description Encuentra un usuario por su nombre de usuario.
   * @param {string} nombre_usuario
   * @returns {Promise<Usuario|null>}
   */
  async findByUsername(nombre_usuario) {
    return Usuario.findOne({
      where: {
        activo: true,
        nombre_usuario: nombre_usuario,
      },
    });
  }, // 🚨 COMA AGREGADA AQUÍ
  /**
   * @async
   * @function findAll
   * @description Obtiene todos los usuarios de la base de datos.
   * @returns {Promise<Usuario[]>}
   */
  async findAll() {
    return Usuario.findAll();
  }, // 🚨 COMA AGREGADA AQUÍ
  /**
   * @async
   * @function findById
   * @description Obtiene un usuario por su clave primaria (ID).
   * @param {number} id - ID del usuario.
   * @returns {Promise<Usuario|null>}
   */
  async findById(id) {
    return Usuario.findByPk(id);
  }, // 🚨 COMA AGREGADA AQUÍ
  /**
   * @async
   * @function update
   * @description Actualiza los datos de un usuario por ID, validando unicidad en email y nombre_usuario.
   * @param {number} id - ID del usuario a actualizar.
   * @param {Object} data - Nuevos datos.
   * @returns {Promise<Usuario|null>} El usuario actualizado o null si no existe.
   * @throws {Error} Si el email o nombre_usuario ya están en uso por otra cuenta activa.
   */
  async update(id, data) {
    const usuario = await this.findById(id);

    if (!usuario) {
      return null;
    }

    // ------------------------------------------------------------------
    // 🛑 VALIDACIÓN DE UNICIDAD (PARA CUENTAS ACTIVAS)
    // ------------------------------------------------------------------
    const { email, nombre_usuario, dni } = data; // ✅ Extraemos también el DNI

    // 1. Validar Email
    if (email && email !== usuario.email) {
      const existingEmailUser = await Usuario.findOne({
        where: { email, activo: true, id: { [Op.ne]: id } },
      });
      if (existingEmailUser) {
        throw new Error("❌ El email ya está en uso por otra cuenta activa.");
      }
    }

    // 2. Validar Nombre de Usuario
    if (nombre_usuario && nombre_usuario !== usuario.nombre_usuario) {
      const existingUsernameUser = await Usuario.findOne({
        where: { nombre_usuario, activo: true, id: { [Op.ne]: id } },
      });
      if (existingUsernameUser) {
        throw new Error(
          "❌ El nombre de usuario ya está tomado por otra cuenta activa.",
        );
      }
    }

    // 3. 🔥 NUEVA VALIDACIÓN: Validar DNI
    if (dni && dni !== usuario.dni) {
      const existingDniUser = await Usuario.findOne({
        where: {
          dni: dni,
          activo: true,
          id: { [Op.ne]: id },
        },
      });
      if (existingDniUser) {
        throw new Error("❌ El DNI ya está registrado en otra cuenta activa.");
      }
    }

    return usuario.update(data);
  },
  /**
   * @async
   * @function findAllActivos
   * @description Obtiene todos los usuarios cuyo campo 'activo' es verdadero.
   * @returns {Promise<Usuario[]>}
   */
  async findAllActivos() {
    return Usuario.findAll({ where: { activo: true } });
  }, // 🚨 COMA AGREGADA AQUÍ
  /**
   * @async
   * @function findAllAdmins
   * @description Obtiene todos los usuarios que son administradores y están activos.
   * @returns {Promise<Usuario[]>} Lista de usuarios administradores.
   * 🚨 NOTA: Se asume que existe un campo `es_admin` en el modelo Usuario.
   */
  async findAllAdmins() {
    // Asegúrate de que tu modelo Usuario tenga un campo que identifique a los administradores.
    return Usuario.findAll({
      where: {
        rol: "admin",
        activo: true, // Asumo que solo quieres administradores activos
      },
    });
  }, // 🚨 COMA AGREGADA AQUÍ
  /**
   * @async
   * @function cleanUnconfirmedAccounts
   * @description Elimina permanentemente cuentas no confirmadas que excedieron el periodo de gracia.
   * @param {number} [daysOld=7] - Días de gracia antes de la eliminación.
   * @returns {Promise<number>} Número de filas eliminadas.
   */
  async cleanUnconfirmedAccounts(daysOld = 7) {
    // 1. Calcular la fecha límite (usuarios creados antes de esta fecha).
    const limiteFecha = new Date();
    limiteFecha.setDate(limiteFecha.getDate() - daysOld); // 2. Buscar usuarios que cumplen las condiciones:

    const usuariosParaEliminar = await Usuario.findAll({
      where: {
        confirmado_email: false,
        createdAt: {
          [Op.lt]: limiteFecha, // anterior a la fecha límite
        },
      },
      attributes: ["id", "email"], // Solo necesitamos el ID para la eliminación y el email para registro/debug
    });

    if (usuariosParaEliminar.length === 0) {
      return 0;
    } // 3. Eliminar las cuentas encontradas (Eliminación física - Hard Delete)

    const idsAEliminar = usuariosParaEliminar.map((u) => u.id);
    const resultado = await Usuario.destroy({
      where: {
        id: {
          [Op.in]: idsAEliminar,
        },
      },
    });

    return resultado;
  },
  /**
   * @async
   * @function adminReset2FA
   * @description Permite a un administrador deshabilitar el 2FA de un usuario forzosamente,
   * eliminando el secreto y marcando is_2fa_enabled como false.
   * (Solo para uso interno por el controlador Admin).
   * @param {number} userIdToReset - ID del usuario a quien se le reinicia el 2FA.
   * @returns {Promise<boolean>} True si el usuario fue encontrado y actualizado.
   * @throws {Error} Si el usuario no existe.
   */
  async adminReset2FA(userIdToReset) {
    const user = await Usuario.findByPk(userIdToReset);
    if (!user) {
      throw new Error("Usuario no encontrado.");
    }

    if (!user.is_2fa_enabled) {
      // Opcional: Si ya está deshabilitado, se considera exitoso o se lanza un error específico.
      // Optamos por el éxito (idempotencia).
      return true;
    }

    await user.update({
      is_2fa_enabled: false,
      twofa_secret: null, // CRÍTICO: Eliminar el secreto
    });

    return true;
  },
  /**
   * @description Busca un usuario activo por DNI.
   */
  async findByDni(dni) {
    return Usuario.findOne({
      where: {
        dni: dni,
        activo: true, // Importante: Solo buscar entre cuentas activas
      },
    });
  },
  /**
   * @async
   * @function searchByUsername
   * @description Busca usuarios activos por una coincidencia parcial en el nombre_usuario o email.
   * @param {string} searchTerm - El término de búsqueda (ej. 'juan' o 'juan@').
   * @returns {Promise<Usuario[]>} Lista de usuarios activos que coinciden con el término.
   */
  async searchByUsername(searchTerm) {
    // Usamos ILIKE (o LIKE + LOWER en bases de datos sensibles a mayúsculas) para búsqueda insensible.
    const searchPattern = `%${searchTerm}%`;

    return Usuario.findAll({
      where: {
        activo: true, // Solo usuarios activos
        [Op.or]: [
          {
            nombre_usuario: {
              [Op.iLike]: searchPattern,
            },
          },
          {
            email: {
              [Op.iLike]: searchPattern,
            },
          },
        ],
      },
      // Opcional: Limitar resultados u ordenar
      order: [["nombre_usuario", "ASC"]],
      limit: 50,
    });
  },
  /**
   * @async
   * @function validateUserDeactivation
   * @description Valida si un usuario puede desactivar su cuenta verificando:
   * - Suscripciones activas (bloqueante)
   * - Pujas ganadoras pendientes de pago (advertencia)
   * - Contratos firmados disponibles para descarga (advertencia)
   * @param {number} userId - ID del usuario.
   * @returns {Promise<object>} Objeto con validación y detalles.
   * @throws {Error} Si hay suscripciones activas que impidan la desactivación.
   */
  async validateUserDeactivation(userId) {
    // 1. 🚨 VALIDACIÓN CRÍTICA: Suscripciones Activas (BLOQUEANTE)
    const suscripcionesActivas = await SuscripcionProyecto.findAll({
      where: {
        id_usuario: userId,
        activo: true,
      },
      include: [
        {
          model: require("../models/proyecto"),
          as: "proyectoAsociado",
          attributes: ["id", "nombre_proyecto"],
        },
      ],
    });

    if (suscripcionesActivas.length > 0) {
      const proyectos = suscripcionesActivas.map(
        (s) => s.proyectoAsociado.nombre_proyecto,
      );

      throw new Error(
        `❌ No puedes desactivar tu cuenta. Tienes ${
          suscripcionesActivas.length
        } suscripción(es) activa(s) en: ${proyectos.join(
          ", ",
        )}. Debes cancelar todas tus suscripciones primero.`,
      );
    }

    // 2. ⚠️ ADVERTENCIA: Pujas Ganadoras Pendientes de Pago
    const pujasGanadorasPendientes = await Puja.findAll({
      where: {
        id_usuario: userId,
        estado_puja: "ganadora_pendiente",
      },
      include: [
        {
          model: require("../models/lote"),
          as: "lote",
          attributes: ["id", "nombre_lote"],
        },
      ],
    });

    // 3. 📄 INFORMACIÓN: Contratos Firmados Disponibles
    const contratosFirmados = await ContratoFirmado.findAll({
      where: {
        id_usuario_firmante: userId,
        activo: true,
        estado_firma: "FIRMADO",
      },
      attributes: ["id", "nombre_archivo", "fecha_firma"],
      order: [["fecha_firma", "DESC"]],
    });

    // 4. Construir respuesta con toda la información
    return {
      canDeactivate: true, // Pasó las validaciones bloqueantes
      warnings: {
        pujasGanadorasPendientes: pujasGanadorasPendientes.length > 0,
        pujasDetalle: pujasGanadorasPendientes.map((p) => ({
          id_lote: p.lote.id,
          nombre_lote: p.lote.nombre_lote,
          monto_puja: p.monto_puja,
          fecha_vencimiento: p.fecha_vencimiento_pago,
        })),
        contratosFirmados: contratosFirmados.length > 0,
        contratosDetalle: contratosFirmados.map((c) => ({
          id: c.id,
          nombre_archivo: c.nombre_archivo,
          fecha_firma: c.fecha_firma,
        })),
      },
      message: this._buildDeactivationMessage(
        pujasGanadorasPendientes.length,
        contratosFirmados.length,
      ),
    };
  },
  /**
   * @async
   * @function adminResetPassword
   * @description Permite a un admin establecer una nueva contraseña para cualquier usuario.
   * @param {number} userId - ID del usuario target.
   * @param {string} newPassword - Nueva contraseña en texto plano.
   * @returns {Promise<boolean>}
   */
  async adminResetPassword(userId, newPassword) {
    if (!newPassword || newPassword.length < 8) {
      throw new Error("La contraseña debe tener al menos 8 caracteres.");
    }

    const usuario = await Usuario.findByPk(userId);
    if (!usuario) {
      throw new Error("Usuario no encontrado.");
    }

    const authService = require("./auth.service");
    const newHash = await authService.hashPassword(newPassword);

    await usuario.update({ contraseña_hash: newHash });
    return true;
  },
  /**
   * @private
   * @function _buildDeactivationMessage
   * @description Construye un mensaje personalizado según las advertencias encontradas.
   */ _buildDeactivationMessage(pujasCount, contratosCount) {
    const messages = [];

    if (pujasCount > 0) {
      messages.push(
        `⚠️ Tienes ${pujasCount} puja(s) ganadora(s) pendiente(s) de pago. Si no pagas en 90 días, perderás el lote y pasará al siguiente postor.`,
      );
    }

    if (contratosCount > 0) {
      messages.push(
        `📄 Tienes ${contratosCount} contrato(s) firmado(s). Te recomendamos descargar todos tus contratos antes de desactivar tu cuenta, ya que no podrás acceder a ellos después.`,
      );
    }

    if (messages.length === 0) {
      return "✅ Tu cuenta puede ser desactivada sin inconvenientes.";
    }

    return messages.join(" ");
  },
  async changePassword(userId, currentPassword, newPassword, twofaCode = null) {
    const usuario = await Usuario.findByPk(userId, {
      attributes: [
        "id",
        "contraseña_hash",
        "activo",
        "is_2fa_enabled",
        "twofa_secret",
      ],
    });

    if (!usuario || !usuario.activo) {
      throw new Error("Usuario no encontrado.");
    }

    const authService = require("./auth.service");

    // 1. Verificar contraseña actual
    const isMatch = await authService.comparePassword(
      currentPassword,
      usuario.contraseña_hash,
    );
    if (!isMatch) {
      throw new Error("❌ La contraseña actual es incorrecta.");
    }

    // 2. Validar nueva contraseña
    if (!newPassword || newPassword.length < 8) {
      throw new Error(
        "❌ La nueva contraseña debe tener al menos 8 caracteres.",
      );
    }
    if (currentPassword === newPassword) {
      throw new Error("❌ La nueva contraseña no puede ser igual a la actual.");
    }

    // 3. Verificar 2FA si está activo
    if (usuario.is_2fa_enabled) {
      if (!twofaCode) {
        const error = new Error(
          "Se requiere el código 2FA para cambiar la contraseña.",
        );
        error.requires2fa = true;
        throw error;
      }

      const auth2faService = require("./auth2fa.service");
      const isTokenValid = auth2faService.verifyToken(
        usuario.twofa_secret,
        twofaCode,
      );
      if (!isTokenValid) {
        const error = new Error("❌ Código 2FA incorrecto.");
        error.requires2fa = true;
        error.codeInvalid = true;
        throw error;
      }
    }

    // 4. Hashear y guardar
    const newHash = await authService.hashPassword(newPassword);
    return usuario.update({ contraseña_hash: newHash });
  },
  /**
   * @async
   * @function softDelete
   * @description "Elimina" un usuario marcándolo como inactivo.
   * Ahora incluye validación previa obligatoria.
   * @param {number} id - ID del usuario.
   * @returns {Promise<Usuario|null>} El usuario actualizado o null si no existe.
   * @throws {Error} Si el usuario tiene suscripciones activas.
   */ async softDelete(id) {
    // 🆕 VALIDACIÓN OBLIGATORIA ANTES DE DESACTIVAR
    await this.validateUserDeactivation(id);

    const usuario = await this.findById(id);
    if (!usuario) {
      return null;
    }

    const usuarioDesactivado = await usuario.update({
      activo: false,
      is_2fa_enabled: false, // 🛑 Agregado
      twofa_secret: null, // 🛑 Agregado
    });
    try {
      if (usuario.email) {
        await emailService.notificarDesactivacionCuenta(usuario);
      }
    } catch (error) {
      console.error(
        `Error al enviar email de desactivación al usuario ${id}:`,
        error.message,
      );
      // No lanzamos el error para que la desactivación se complete igual
    }

    return usuarioDesactivado;
  },
  /**
   * @async
   * @function prepareAccountForReactivation
   * @description Permite cambiar email/username de una cuenta INACTIVA para resolver conflictos
   * antes de reactivarla. Solo funciona con cuentas desactivadas.
   * @param {number} userId - ID del usuario inactivo.
   * @param {object} newData - Nuevos datos (email, nombre_usuario).
   * @returns {Promise<Usuario>} Usuario actualizado.
   * @throws {Error} Si la cuenta está activa o hay conflictos de unicidad con cuentas ACTIVAS.
   */
  async prepareAccountForReactivation(userId, newData) {
    // 1️⃣ Buscar al usuario y verificar si está inactivo
    const usuario = await Usuario.findByPk(userId);

    if (!usuario) {
      throw new Error(`❌ No se encontró un usuario con ID ${userId}.`);
    }
    if (usuario.activo) {
      throw new Error(
        `❌ La cuenta con ID ${userId} ya está activa. No requiere preparación.`,
      );
    }

    const { email, nombre_usuario, dni } = newData; // 2️⃣ Validar nuevo Email (si se proporciona Y es diferente al actual)

    if (email && email !== usuario.email) {
      const existingEmail = await Usuario.findOne({
        where: {
          email: email,
          activo: true, // SOLO buscar conflictos en cuentas ACTIVAS
          id: { [Op.ne]: userId },
        },
      });

      if (existingEmail) {
        throw new Error(
          `❌ El Email "${email}" ya está en uso por otra cuenta ACTIVA (ID: ${existingEmail.id}).`,
        );
      }
    } // 3️⃣ Validar nuevo Nombre de Usuario (si se proporciona Y es diferente al actual)

    if (nombre_usuario && nombre_usuario !== usuario.nombre_usuario) {
      const existingUsername = await Usuario.findOne({
        where: {
          nombre_usuario: nombre_usuario,
          activo: true, // SOLO buscar conflictos en cuentas ACTIVAS
          id: { [Op.ne]: userId },
        },
      });

      if (existingUsername) {
        throw new Error(
          `❌ El Nombre de Usuario "${nombre_usuario}" ya está en uso por otra cuenta ACTIVA (ID: ${existingUsername.id}).`,
        );
      }
    } // 4️⃣ Validar nuevo DNI (si se proporciona Y es diferente al actual)

    if (dni && dni !== usuario.dni) {
      const existingDNI = await Usuario.findOne({
        where: {
          dni: dni,
          activo: true, // ✅ CRÍTICO: SOLO BUSCAR CONFLICTOS ACTIVOS
          id: { [Op.ne]: userId },
        },
      });

      if (existingDNI) {
        throw new Error(
          `❌ El DNI "${dni}" ya está en uso por otra cuenta ACTIVA (ID: ${existingDNI.id}).`,
        );
      }
    } // 5️⃣ Actualizar solo los campos permitidos y proporcionados

    const allowedFields = ["email", "nombre_usuario", "dni"];
    const filteredData = {};

    for (const field of allowedFields) {
      if (newData[field]) {
        filteredData[field] = newData[field];
      }
    } // 6️⃣ Aplicar actualización

    if (Object.keys(filteredData).length === 0) {
      return usuario; // No hay cambios para aplicar, retornar el usuario original
    }

    return usuario.update(filteredData);
  },
  /**
   * @async
   * @function reactivateAccount
   * @description Reactiva una cuenta inactiva. Debe llamarse DESPUÉS de resolver conflictos.
   * @param {number} userId - ID del usuario a reactivar.
   * @returns {Promise<Usuario>} Usuario reactivado.
   * @throws {Error} Si la cuenta no existe o ya está activa.
   */
  async reactivateAccount(userId) {
    const usuario = await this.findById(userId);

    if (!usuario) {
      throw new Error("Usuario no encontrado.");
    }

    if (usuario.activo) {
      throw new Error("❌ Esta cuenta ya está activa.");
    }

    // ⚠️ VALIDACIÓN FINAL: Verificar que no haya conflictos antes de reactivar
    const conflictoEmail = await Usuario.findOne({
      where: {
        email: usuario.email,
        activo: true,
        id: { [Op.ne]: userId },
      },
    });

    if (conflictoEmail) {
      throw new Error(
        `❌ No se puede reactivar. El email "${usuario.email}" ya está en uso por una cuenta activa (ID: ${conflictoEmail.id}). Debes cambiar el email antes de reactivar.`,
      );
    }

    const conflictoUsername = await Usuario.findOne({
      where: {
        nombre_usuario: usuario.nombre_usuario,
        activo: true,
        id: { [Op.ne]: userId },
      },
    });

    if (conflictoUsername) {
      throw new Error(
        `❌ No se puede reactivar. El nombre de usuario "${usuario.nombre_usuario}" ya está en uso por una cuenta activa (ID: ${conflictoUsername.id}). Debes cambiar el username antes de reactivar.`,
      );
    }

    // ✅ Reactivar la cuenta
    const usuarioReactivado = await usuario.update({ activo: true });

    // 🆕 ENVÍO DE EMAIL DE CONFIRMACIÓN
    try {
      if (usuario.email) {
        await emailService.notificarReactivacionCuenta(usuarioReactivado);
      }
    } catch (error) {
      console.error(
        `Error al enviar email de reactivación al usuario ${userId}:`,
        error.message,
      );
      // No lanzamos el error para que la reactivación se complete igual
    }

    return usuarioReactivado;
  },
  /**
   * @async
   * @function get2FASecret
   * @description Obtiene el secreto 2FA (twofa_secret) de un usuario.
   * @param {number} userId - ID del usuario.
   * @returns {Promise<string|null>} El secreto Base32 o null si no está activo.
   */
  async get2FASecret(userId) {
    const usuario = await Usuario.findByPk(userId, {
      attributes: ["id", "is_2fa_enabled", "twofa_secret"], // Solo recuperamos los campos de 2FA
    });

    if (!usuario || !usuario.is_2fa_enabled) {
      return null;
    }
    return usuario.twofa_secret;
  },
};

module.exports = usuarioService;
