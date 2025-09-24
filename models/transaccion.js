// Archivo: models/Transaccion.js
const { sequelize, DataTypes } = require('../config/database');
const baseAttributes = require('./base');

const Transaccion = sequelize.define('Transaccion', {
  ...baseAttributes,
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
    allowNull: true,
  },
  id_pago: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  id_inversion: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  // NUEVO: Agrega el campo para vincular a una Puja
  id_puja: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  // NUEVO: Un estado para la transacción
  estado_transaccion: {
    type: DataTypes.ENUM('pendiente', 'pagado', 'fallido', 'reembolsado'),
    allowNull: false,
    defaultValue: 'pendiente',
  },
}, {
  tableName: 'transaccion',
});

module.exports = Transaccion;