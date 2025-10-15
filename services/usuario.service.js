// Archivo: services/usuario.service.js

const Usuario = require("../models/usuario");
const { Op } = require("sequelize");
const emailService = require("./email.service");
const crypto = require("crypto");

const generateToken = () => {
  return crypto.randomBytes(20).toString("hex");
};

const usuarioService = {
  // Función para crear un nuevo usuario (REGISTRO)
  async create(data) {
    const token = generateToken();
    const expiracion = new Date();
    expiracion.setHours(expiracion.getHours() + 24);

    const dataConToken = {
      ...data,
      confirmacion_token: token,
      confirmacion_token_expiracion: expiracion,
      confirmado_email: false,
    };

    const nuevoUsuario = await Usuario.create(dataConToken);

    try {
      await emailService.sendConfirmationEmail(nuevoUsuario, token);
    } catch (e) {
      console.error(
        `ERROR: Fallo al enviar el email de confirmación a ${nuevoUsuario.email}.`,
        e
      );
    }

    return nuevoUsuario;
  },

  // Procesa el token de confirmación
  async confirmEmail(token) {
    const usuario = await Usuario.findOne({
      where: {
        confirmacion_token: token,
        confirmacion_token_expiracion: { [Op.gt]: new Date() },
      },
    });

    if (!usuario) {
      throw new Error("Token de confirmación inválido o expirado.");
    }

    return usuario.update({
      confirmado_email: true,
      activo: true,
      confirmacion_token: null,
      confirmacion_token_expiracion: null,
    });
  },

  /**
   * Genera un nuevo token y reenvía el email de confirmación.
   */
  async resendConfirmationEmail(email) {
    const usuario = await Usuario.findOne({ where: { email } });

    if (!usuario) {
      throw new Error(
        "Si la cuenta existe, recibirá un correo electrónico pronto."
      );
    }

    if (usuario.confirmado_email) {
      throw new Error("Su cuenta ya ha sido confirmada.");
    }

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
  },

  /**
   * Genera un token seguro para restablecer contraseña.
   */
  async generatePasswordResetToken(email) {
    const user = await Usuario.findOne({ where: { email } });

    if (!user) {
      return;
    }

    const resetToken = crypto.randomBytes(20).toString("hex");
    const expirationDate = new Date();
    expirationDate.setHours(expirationDate.getHours() + 1);

    await user.update({
      reset_password_token: resetToken,
      reset_password_expires: expirationDate,
    });

    return resetToken;
  },

  /**
   * Busca un usuario por el token de restablecimiento y verifica su expiración.
   */
  async findByResetToken(token) {
    const user = await Usuario.findOne({
      where: {
        reset_password_token: token,
        reset_password_expires: { [Op.gt]: new Date() },
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

  // Obtiene todos los usuarios activos
  async findAllActivos() {
    return Usuario.findAll({ where: { activo: true } });
  },
  /**
   * Elimina permanentemente cuentas no confirmadas y expiradas.
   */
  async cleanUnconfirmedAccounts(daysOld = 7) {
    // Calcular la fecha límite.
    const limiteFecha = new Date();
    limiteFecha.setDate(limiteFecha.getDate() - daysOld); // Encontrar usuarios que cumplen las condiciones: // - confirmado_email: false // - Creados antes de la fecha límite ('createdAt' se asume de baseAttributes)

    const usuariosParaEliminar = await Usuario.findAll({
      where: {
        confirmado_email: false,
        createdAt: {
          [Op.lt]: limiteFecha, // anterior a la fecha límite
        },
      },
      attributes: ["id", "email"],
    });

    if (usuariosParaEliminar.length === 0) {
      return 0;
    } // Eliminar las cuentas encontradas (Hard Delete - Eliminación física)

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
};

module.exports = usuarioService;
