const { sequelize, DataTypes } = require("../config/database");
const baseAttributes = require("./base");

const Usuario = sequelize.define(
  "Usuario",
  {
    ...baseAttributes,
    nombre: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    apellido: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    email: {
      type: DataTypes.STRING(255), // 🛑 1. ELIMINAMOS unique: true DE AQUÍ 🛑
      allowNull: false,
    },
    dni: {
      type: DataTypes.STRING(20), // 🛑 2. ELIMINAMOS unique: true DE AQUÍ 🛑
      allowNull: false,
    },
    nombre_usuario: {
      type: DataTypes.STRING(50), // 🛑 3. ELIMINAMOS unique: true DE AQUÍ 🛑
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
    // 🚀 CAMBIOS PARA 2FA 🚀
    is_2fa_enabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false, // Por defecto, el 2FA está deshabilitado
      comment: "Indica si el 2FA está activo para este usuario",
    },
    twofa_secret: {
      type: DataTypes.STRING(255),
      allowNull: true, // Será NULL si el 2FA no está habilitado
      comment: "Clave secreta para la generación de códigos TOTP (Google Authenticator)",
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
    tableName: "usuario", // 🛑 4. AÑADIMOS ÍNDICES COMPUESTOS ÚNICOS CONDICIONALES 🛑
    indexes: [
      // Este índice asegura que el email sea único SÓLO si la cuenta está activa.
      // Esto es específico de PostgreSQL (donde el where es más limpio).
      // Para otros DBs como MySQL/MariaDB, se usa el campo 'activo'.
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
