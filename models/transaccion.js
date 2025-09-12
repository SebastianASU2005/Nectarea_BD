// Archivo: models/Transaccion.js
const { sequelize, DataTypes } = require('../config/database');
const baseAttributes = require('./base');

const Transaccion = sequelize.define('Transaccion', {
  ...baseAttributes, // Incluye los campos 'id' y 'activo'
  tipo_transaccion: {
    type: DataTypes.STRING(50),
    allowNull: false,
  },
  monto: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
  },
  fecha_transaccion: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
  id_usuario: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  id_proyecto: {
    type: DataTypes.INTEGER,
    allowNull: true, // Este campo puede ser nulo, como en tu modelo de Python
  },
}, {
  tableName: 'transaccion',
});

module.exports = Transaccion;