// Archivo: models/Inversion.js
const { sequelize, DataTypes } = require('../config/database');
const baseAttributes = require('./base');

const Inversion = sequelize.define('Inversion', {
  ...baseAttributes, // Incluye los campos 'id' y 'activo'
  monto_invertido: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
  },
  fecha_inversion: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW, // Sequelize tiene una opción para la fecha actual
  },
  id_inversor: {
    type: DataTypes.INTEGER,
    allowNull: false,
    // La clave foránea se define en la asociación, pero es bueno tenerla aquí para claridad
  },
  id_proyecto: {
    type: DataTypes.INTEGER,
    allowNull: false,
    // La clave foránea se define en la asociación
  },
}, {
  tableName: 'inversion', // Define el nombre de la tabla explícitamente
});

module.exports = Inversion;