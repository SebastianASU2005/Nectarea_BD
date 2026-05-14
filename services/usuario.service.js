// Archivo: services/usuario.service.js (CON AUDITORÍA PARA ADMINS)

const Usuario = require("../models/usuario");
const { Op } = require("sequelize");
const emailService = require("./email.service");
const crypto = require("crypto");
const SuscripcionProyecto = require("../models/suscripcion_proyecto");
const Puja = require("../models/puja");
const ContratoFirmado = require("../models/ContratoFirmado");
const auditService = require("./audit.service"); // 🆕 Auditoría

const generateToken = () => {
  return crypto.randomBytes(20).toString("hex");
};

const usuarioService = {
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
        e,
      );
    }
    return nuevoUsuario;
  },

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

  async resendConfirmationEmail(email) {
    const usuario = await Usuario.findOne({ where: { email } });
    if (!usuario) {
      throw new Error(
        "Si la cuenta existe, recibirá un correo electrónico pronto.",
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

  async generatePasswordResetToken(email) {
    const user = await Usuario.findOne({ where: { email } });
    if (!user) return;
    const resetToken = crypto.randomBytes(20).toString("hex");
    const expirationDate = new Date();
    expirationDate.setHours(expirationDate.getHours() + 1);
    await user.update({
      reset_password_token: resetToken,
      reset_password_expires: expirationDate,
    });
    try {
      await emailService.sendPasswordResetEmail(user, resetToken);
    } catch (e) {
      console.error(
        `ERROR: Fallo al enviar el email de restablecimiento a ${user.email}.`,
        e,
      );
    }
    return resetToken;
  },

  async findByResetToken(token) {
    const user = await Usuario.findOne({
      where: {
        reset_password_token: token,
        reset_password_expires: { [Op.gt]: new Date() },
      },
    });
    return user;
  },

  async findByUsernameOrEmail(identifier) {
    return Usuario.findOne({
      where: {
        activo: true,
        [Op.or]: [{ nombre_usuario: identifier }, { email: identifier }],
      },
    });
  },

  async findByEmail(email) {
    return Usuario.findOne({
      where: { email: email, activo: true },
    });
  },

  async findByUsername(nombre_usuario) {
    return Usuario.findOne({
      where: { activo: true, nombre_usuario: nombre_usuario },
    });
  },

  async findAll() {
    return Usuario.findAll();
  },

  async findById(id) {
    return Usuario.findByPk(id);
  },

  /**
   * Actualiza un usuario. Si se pasa adminContext, se registra auditoría.
   * @param {number} id
   * @param {Object} data
   * @param {Object} [adminContext] - { adminId, ip, userAgent, motivo }
   */
  async update(id, data, adminContext = {}) {
    const { adminId, ip, userAgent, motivo } = adminContext;
    const usuario = await this.findById(id);
    if (!usuario) return null;

    const { email, nombre_usuario, dni } = data;

    if (email && email !== usuario.email) {
      const existingEmailUser = await Usuario.findOne({
        where: { email, activo: true, id: { [Op.ne]: id } },
      });
      if (existingEmailUser) {
        throw new Error("❌ El email ya está en uso por otra cuenta activa.");
      }
    }
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
    if (dni && dni !== usuario.dni) {
      const existingDniUser = await Usuario.findOne({
        where: { dni: dni, activo: true, id: { [Op.ne]: id } },
      });
      if (existingDniUser) {
        throw new Error("❌ El DNI ya está registrado en otra cuenta activa.");
      }
    }

    const datosPrevios = usuario.toJSON();
    const usuarioActualizado = await usuario.update(data);
    if (adminId) {
      await auditService.registrar({
        usuarioId: adminId,
        accion: "ACTUALIZAR_USUARIO",
        entidadTipo: "Usuario",
        entidadId: usuario.id,
        datosPrevios,
        datosNuevos: usuarioActualizado.toJSON(),
        motivo: motivo || null,
        ip,
        userAgent,
      });
    }
    return usuarioActualizado;
  },

  async findAllActivos() {
    return Usuario.findAll({ where: { activo: true } });
  },

  async findAllAdmins() {
    return Usuario.findAll({
      where: { rol: "admin", activo: true },
    });
  },

  async cleanUnconfirmedAccounts(daysOld = 7) {
    const limiteFecha = new Date();
    limiteFecha.setDate(limiteFecha.getDate() - daysOld);
    const usuariosParaEliminar = await Usuario.findAll({
      where: {
        confirmado_email: false,
        createdAt: { [Op.lt]: limiteFecha },
      },
      attributes: ["id", "email"],
    });
    if (usuariosParaEliminar.length === 0) return 0;
    const idsAEliminar = usuariosParaEliminar.map((u) => u.id);
    const resultado = await Usuario.destroy({
      where: { id: { [Op.in]: idsAEliminar } },
    });
    return resultado;
  },

  /**
   * Admin reset 2FA con auditoría.
   */
  async adminReset2FA(userIdToReset, adminContext = {}) {
    const { adminId, ip, userAgent } = adminContext;
    const user = await Usuario.findByPk(userIdToReset);
    if (!user) throw new Error("Usuario no encontrado.");
    const datosPrevios = user.toJSON();
    await user.update({
      is_2fa_enabled: false,
      twofa_secret: null,
    });
    if (adminId) {
      await auditService.registrar({
        usuarioId: adminId,
        accion: "RESET_2FA_USUARIO",
        entidadTipo: "Usuario",
        entidadId: user.id,
        datosPrevios,
        datosNuevos: user.toJSON(),
        ip,
        userAgent,
      });
    }
    return true;
  },

  async findByDni(dni) {
    return Usuario.findOne({
      where: { dni: dni, activo: true },
    });
  },

  async searchByUsername(searchTerm) {
    const searchPattern = `%${searchTerm}%`;
    return Usuario.findAll({
      where: {
        activo: true,
        [Op.or]: [
          { nombre_usuario: { [Op.iLike]: searchPattern } },
          { email: { [Op.iLike]: searchPattern } },
        ],
      },
      order: [["nombre_usuario", "ASC"]],
      limit: 50,
    });
  },

  async validateUserDeactivation(userId) {
    const suscripcionesActivas = await SuscripcionProyecto.findAll({
      where: { id_usuario: userId, activo: true },
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
    const pujasGanadorasPendientes = await Puja.findAll({
      where: { id_usuario: userId, estado_puja: "ganadora_pendiente" },
      include: [
        {
          model: require("../models/lote"),
          as: "lote",
          attributes: ["id", "nombre_lote"],
        },
      ],
    });
    const contratosFirmados = await ContratoFirmado.findAll({
      where: {
        id_usuario_firmante: userId,
        activo: true,
        estado_firma: "FIRMADO",
      },
      attributes: ["id", "nombre_archivo", "fecha_firma"],
      order: [["fecha_firma", "DESC"]],
    });
    return {
      canDeactivate: true,
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
   * Admin reset password con auditoría.
   */
  async adminResetPassword(userId, newPassword, adminContext = {}) {
    const { adminId, ip, userAgent } = adminContext;
    if (!newPassword || newPassword.length < 8) {
      throw new Error("La contraseña debe tener al menos 8 caracteres.");
    }
    const usuario = await Usuario.findByPk(userId);
    if (!usuario) throw new Error("Usuario no encontrado.");
    const authService = require("./auth.service");
    const newHash = await authService.hashPassword(newPassword);
    const datosPrevios = usuario.toJSON();
    await usuario.update({ contraseña_hash: newHash });
    if (adminId) {
      await auditService.registrar({
        usuarioId: adminId,
        accion: "RESET_PASSWORD_USUARIO",
        entidadTipo: "Usuario",
        entidadId: usuario.id,
        datosPrevios,
        datosNuevos: usuario.toJSON(),
        ip,
        userAgent,
      });
    }
    return true;
  },

  _buildDeactivationMessage(pujasCount, contratosCount) {
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
    if (!usuario || !usuario.activo) throw new Error("Usuario no encontrado.");
    const authService = require("./auth.service");
    const isMatch = await authService.comparePassword(
      currentPassword,
      usuario.contraseña_hash,
    );
    if (!isMatch) throw new Error("❌ La contraseña actual es incorrecta.");
    if (!newPassword || newPassword.length < 8)
      throw new Error(
        "❌ La nueva contraseña debe tener al menos 8 caracteres.",
      );
    if (currentPassword === newPassword)
      throw new Error("❌ La nueva contraseña no puede ser igual a la actual.");
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
    const newHash = await authService.hashPassword(newPassword);
    return usuario.update({ contraseña_hash: newHash });
  },

  /**
   * Soft delete (desactivar) con auditoría.
   */
  async softDelete(id, adminContext = {}) {
    const { adminId, ip, userAgent, motivo } = adminContext;
    await this.validateUserDeactivation(id);
    const usuario = await this.findById(id);
    if (!usuario) return null;
    const datosPrevios = usuario.toJSON();
    const usuarioDesactivado = await usuario.update({
      activo: false,
      is_2fa_enabled: false,
      twofa_secret: null,
    });
    if (adminId) {
      await auditService.registrar({
        usuarioId: adminId,
        accion: "DESACTIVAR_USUARIO",
        entidadTipo: "Usuario",
        entidadId: usuario.id,
        datosPrevios,
        datosNuevos: usuarioDesactivado.toJSON(),
        motivo: motivo || null,
        ip,
        userAgent,
      });
    }
    try {
      if (usuario.email) {
        await emailService.notificarDesactivacionCuenta(usuario);
      }
    } catch (error) {
      console.error(
        `Error al enviar email de desactivación al usuario ${id}:`,
        error.message,
      );
    }
    return usuarioDesactivado;
  },

  async prepareAccountForReactivation(userId, newData, adminContext = {}) {
    adminContext = adminContext || {};
    const { adminId, ip, userAgent, motivo } = adminContext;

    const usuario = await Usuario.findByPk(userId);
    if (!usuario)
      throw new Error(`❌ No se encontró un usuario con ID ${userId}.`);
    if (usuario.activo)
      throw new Error(`❌ La cuenta con ID ${userId} ya está activa.`);

    const { email, nombre_usuario, dni } = newData;

    if (email && email !== usuario.email) {
      const existingEmail = await Usuario.findOne({
        where: { email: email, activo: true, id: { [Op.ne]: userId } },
      });
      if (existingEmail) {
        throw new Error(
          `❌ El Email "${email}" ya está en uso por otra cuenta ACTIVA (ID: ${existingEmail.id}).`,
        );
      }
    }
    if (nombre_usuario && nombre_usuario !== usuario.nombre_usuario) {
      const existingUsername = await Usuario.findOne({
        where: {
          nombre_usuario: nombre_usuario,
          activo: true,
          id: { [Op.ne]: userId },
        },
      });
      if (existingUsername) {
        throw new Error(
          `❌ El Nombre de Usuario "${nombre_usuario}" ya está en uso por otra cuenta ACTIVA (ID: ${existingUsername.id}).`,
        );
      }
    }
    if (dni && dni !== usuario.dni) {
      const existingDNI = await Usuario.findOne({
        where: { dni: dni, activo: true, id: { [Op.ne]: userId } },
      });
      if (existingDNI) {
        throw new Error(
          `❌ El DNI "${dni}" ya está en uso por otra cuenta ACTIVA (ID: ${existingDNI.id}).`,
        );
      }
    }

    const allowedFields = ["email", "nombre_usuario", "dni"];
    const filteredData = {};
    for (const field of allowedFields) {
      if (newData[field]) filteredData[field] = newData[field];
    }

    if (Object.keys(filteredData).length === 0) return usuario;

    const datosPrevios = usuario.toJSON();
    const usuarioActualizado = await usuario.update(filteredData);

    if (adminId) {
      await auditService.registrar({
        usuarioId: adminId,
        accion: "PREPARAR_REACTIVACION_USUARIO",
        entidadTipo: "Usuario",
        entidadId: usuario.id,
        datosPrevios,
        datosNuevos: usuarioActualizado.toJSON(),
        motivo,
        ip,
        userAgent,
      });
    }
    return usuarioActualizado;
  },

  async reactivateAccount(userId, adminContext = {}) {
    adminContext = adminContext || {};
    const { adminId, ip, userAgent, motivo } = adminContext;

    const usuario = await this.findById(userId);
    if (!usuario) throw new Error("Usuario no encontrado.");
    if (usuario.activo) throw new Error("❌ Esta cuenta ya está activa.");

    const conflictoEmail = await Usuario.findOne({
      where: { email: usuario.email, activo: true, id: { [Op.ne]: userId } },
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

    const datosPrevios = usuario.toJSON();
    const usuarioReactivado = await usuario.update({ activo: true });

    if (adminId) {
      await auditService.registrar({
        usuarioId: adminId,
        accion: "REACTIVAR_USUARIO",
        entidadTipo: "Usuario",
        entidadId: usuario.id,
        datosPrevios,
        datosNuevos: usuarioReactivado.toJSON(),
        motivo,
        ip,
        userAgent,
      });
    }

    try {
      if (usuario.email) {
        await emailService.notificarReactivacionCuenta(usuarioReactivado);
      }
    } catch (error) {
      console.error(
        `Error al enviar email de reactivación al usuario ${userId}:`,
        error.message,
      );
    }
    return usuarioReactivado;
  },

  async get2FASecret(userId) {
    const usuario = await Usuario.findByPk(userId, {
      attributes: ["id", "is_2fa_enabled", "twofa_secret"],
    });
    if (!usuario || !usuario.is_2fa_enabled) return null;
    return usuario.twofa_secret;
  },
};

module.exports = usuarioService;
