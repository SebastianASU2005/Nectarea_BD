// Archivo: models/Usuario.js
const { sequelize, DataTypes } = require("../config/database");
const baseAttributes = require("./base");

const Usuario = sequelize.define(
  "Usuario",
  {
    ...baseAttributes,
    activo: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false, // La cuenta inicia inactiva hasta confirmar email
    },
    nombre: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    apellido: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    dni: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },
    nombre_usuario: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    contraseña_hash: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    rol: {
      type: DataTypes.ENUM("admin", "cliente"),
      allowNull: false,
      defaultValue: "cliente",
    },
    fecha_registro: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    numero_telefono: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },
    confirmacion_token: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    // 🚀 CAMPOS PARA 2FA OBLIGATORIO 🚀
    is_2fa_enabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: "Indica si el 2FA está activo para este usuario",
    },
    twofa_secret: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment:
        "Clave secreta para la generación de códigos TOTP (Google Authenticator)",
    },
    reset_password_token: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: "Token temporal para restablecer la contraseña",
    },
    reset_password_expires: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "Fecha de expiración del token de restablecimiento",
    },
    confirmacion_token_expiracion: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    confirmado_email: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
  },
  {
    tableName: "usuario",
    indexes: [
      {
        unique: true,
        fields: ["email"],
        where: {
          activo: true,
        },
      },
      {
        unique: true,
        fields: ["nombre_usuario"],
        where: {
          activo: true,
        },
      },
      {
        unique: true,
        fields: ["dni"],
        where: {
          activo: true,
        },
      },
    ],
  }
);

module.exports = Usuario;
