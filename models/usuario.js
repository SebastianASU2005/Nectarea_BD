const { sequelize, DataTypes } = require('../config/database');
const baseAttributes = require('./base');

const Usuario = sequelize.define('Usuario', {
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
    type: DataTypes.STRING(255),
    unique: true,
    allowNull: false,
  },
  dni: {
    type: DataTypes.STRING(20),
    unique: true,
    allowNull: false,
  },
  nombre_usuario: {
    type: DataTypes.STRING(50),
    unique: true,
    allowNull: false,
  },
  contraseña_hash: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  rol: {
    type: DataTypes.ENUM('admin', 'cliente'),
    allowNull: false,
    defaultValue:'cliente'
  },
  fecha_registro: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
  numero_telefono: {
    type: DataTypes.STRING(20),
    allowNull: false,
  },
  // **NUEVOS CAMPOS PARA CONFIRMACIÓN DE EMAIL Y AUTENTICACIÓN**
  confirmacion_token: {
    type: DataTypes.STRING,
    allowNull: true,
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
}, {
  tableName: 'usuario',
});

module.exports = Usuario;