// models/Usuario.js
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
    unique: true, // ¡Este campo debe ser único!
    allowNull: false,
  },
  nombre_usuario: {
    type: DataTypes.STRING(50),
    unique: true, // ¡Este campo también debe ser único!
    allowNull: false,
  },
  contraseña_hash: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  rol: {
    type: DataTypes.ENUM('admin', 'cliente'),
    allowNull: false,
  },
  fecha_registro: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
  estado: {
    type: DataTypes.STRING(50),
    defaultValue: 'activo',
  },
}, {
  tableName: 'usuario',
});

module.exports = Usuario;