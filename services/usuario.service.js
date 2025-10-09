const Usuario = require("../models/usuario");
const { Op } = require("sequelize");
const emailService = require("./email.service");
const crypto = require("crypto"); // 🛑 NECESARIO para generar tokens seguros

// 🛑 FUNCIÓN AUXILIAR MEJORADA: Usa crypto para tokens más seguros 🛑
const generateToken = () => {
  // Genera 20 bytes aleatorios y los convierte a una cadena hexadecimal (40 caracteres)
  return crypto.randomBytes(20).toString("hex");
};

const usuarioService = {
  // Función para crear un nuevo usuario (REGISTRO)
  async create(data) {
    // 1. Generar token y tiempo de expiración (24 horas)
    const token = generateToken();
    const expiracion = new Date();
    expiracion.setHours(expiracion.getHours() + 24);

    const dataConToken = {
      ...data,
      confirmacion_token: token,
      confirmacion_token_expiracion: expiracion,
      confirmado_email: false,
    }; // 3. Crear el usuario en la BD

    const nuevoUsuario = await Usuario.create(dataConToken); // 4. Enviar el correo electrónico

    try {
      await emailService.sendConfirmationEmail(nuevoUsuario, token);
    } catch (e) {
      console.error(
        `ERROR: Fallo al enviar el email de confirmación a ${nuevoUsuario.email}.`,
        e
      );
    }

    return nuevoUsuario;
  }, // 🚀 FUNCIÓN CLAVE: Procesa el token de confirmación (confirmEmail está CORRECTA)

  async confirmEmail(token) {
    const usuario = await Usuario.findOne({
      where: {
        confirmacion_token: token, // Verifica que el token sea válido Y NO haya expirado
        confirmacion_token_expiracion: { [Op.gt]: new Date() },
      },
    });

    if (!usuario) {
      throw new Error("Token de confirmación inválido o expirado.");
    }

    return usuario.update({
      confirmado_email: true,
      confirmacion_token: null,
      confirmacion_token_expiracion: null,
    });
  },
  /**
   * 🚀 NUEVA FUNCIÓN: Genera un nuevo token y reenvía el email de confirmación.
   * @param {string} email - El correo del usuario.
   */
  async resendConfirmationEmail(email) {
    const usuario = await Usuario.findOne({ where: { email } });

    if (!usuario) {
      // Es mejor no indicar si el email existe o no por seguridad.
      throw new Error(
        "Si la cuenta existe, recibirá un correo electrónico pronto."
      );
    }

    // Si ya está confirmado, no se necesita hacer nada
    if (usuario.confirmado_email) {
      throw new Error("Su cuenta ya ha sido confirmada.");
    } // 1. Generar nuevo token y expiración (24 horas)

    const nuevoToken = generateToken();
    const expiracion = new Date();
    expiracion.setHours(expiracion.getHours() + 24); // 2. Actualizar el usuario en la BD con el nuevo token

    await usuario.update({
      confirmacion_token: nuevoToken,
      confirmacion_token_expiracion: expiracion,
    }); // 3. Enviar el nuevo correo de confirmación

    try {
      await emailService.sendConfirmationEmail(usuario, nuevoToken);
      return true;
    } catch (e) {
      console.error("Error al reenviar email de confirmación:", e);
      throw new Error("Error al enviar el correo. Intente de nuevo más tarde.");
    }
  },
  /**
   * Genera un token seguro y lo almacena junto con su expiración.
   * @param {string} email - El email del usuario.
   */
  async generatePasswordResetToken(email) {
    const user = await Usuario.findOne({ where: { email } });

    if (!user) {
      // Devolvemos un mensaje genérico por seguridad (para no revelar si el email existe)
      return;
    }

    // 1. Generar un token criptográficamente seguro
    const resetToken = crypto.randomBytes(20).toString("hex");

    // 2. Establecer la expiración (ej: 1 hora a partir de ahora)
    const expirationDate = new Date();
    expirationDate.setHours(expirationDate.getHours() + 1);

    // 3. Guardar el token y la expiración en la DB
    await user.update({
      reset_password_token: resetToken,
      reset_password_expires: expirationDate,
    });

    // 4. Devolver el token para que el controlador pueda enviarlo por email
    return resetToken;
  },

  /**
   * Busca un usuario por el token de restablecimiento y verifica su expiración.
   */
  async findByResetToken(token) {
    const user = await Usuario.findOne({
      where: {
        reset_password_token: token,
        reset_password_expires: { [Op.gt]: new Date() }, // [Op.gt] significa "mayor que" (no ha expirado)
      },
    });
    return user;
  },
  // Función para encontrar un usuario por su nombre de usuario

  async findByUsername(nombre_usuario) {
    return Usuario.findOne({
      where: {
        nombre_usuario: nombre_usuario,
      },
    });
  }, // 🛑 ELIMINAMOS ESTA FUNCIÓN: Es redundante, ya que confirmEmail hace la búsqueda con validación de expiración. 🛑 // async findByConfirmationToken(token) { //   return Usuario.findOne({ //     where: { //       confirmacion_token: token, //     }, //   }); // }, // Obtiene todos los usuarios

  async findAll() {
    return Usuario.findAll();
  }, // Obtiene un usuario por su ID

  async findById(id) {
    return Usuario.findByPk(id);
  }, // Actualiza un usuario

  async update(id, data) {
    const usuario = await this.findById(id);
    if (!usuario) {
      return null;
    }
    return usuario.update(data);
  }, // "Elimina" un usuario (soft delete)

  async softDelete(id) {
    const usuario = await this.findById(id);
    if (!usuario) {
      return null;
    }
    return usuario.update({ activo: false });
  }, // Obtiene todos los usuarios activos

  async findAllActivos() {
    return Usuario.findAll({ where: { activo: true } });
  },
};

module.exports = usuarioService;
