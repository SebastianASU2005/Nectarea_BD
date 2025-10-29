// Archivo: services/usuario.service.js (CORREGIDO)

const Usuario = require("../models/usuario");
const { Op } = require("sequelize");
const emailService = require("./email.service");
const crypto = require("crypto");

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
        e
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
        "Si la cuenta existe, recibirá un correo electrónico pronto."
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
        e
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
        [Op.or]: [{ nombre_usuario: identifier }, { email: identifier }],
      },
    });
  }, // ✅ NUEVA FUNCIÓN AÑADIDA
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
   * @description Actualiza los datos de un usuario por ID.
   * @param {number} id - ID del usuario a actualizar.
   * @param {Object} data - Nuevos datos.
   * @returns {Promise<Usuario|null>} El usuario actualizado o null si no existe.
   */
  async update(id, data) {
    const usuario = await this.findById(id);
    if (!usuario) {
      return null;
    }
    return usuario.update(data);
  }, // 🚨 COMA AGREGADA AQUÍ
  /**
   * @async
   * @function softDelete
   * @description "Elimina" un usuario marcándolo como inactivo.
   * @param {number} id - ID del usuario.
   * @returns {Promise<Usuario|null>} El usuario actualizado o null si no existe.
   */
  async softDelete(id) {
    const usuario = await this.findById(id);
    if (!usuario) {
      return null;
    } // Marca el campo 'activo' como falso.
    return usuario.update({ activo: false });
  }, // 🚨 COMA AGREGADA AQUÍ
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
  }, // La última propiedad no necesita coma
};

module.exports = usuarioService;
