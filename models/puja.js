// Archivo: models/Puja.js
const { sequelize, DataTypes } = require('../config/database');
const baseAttributes = require('./base');

const Puja = sequelize.define('Puja', {
  ...baseAttributes,
  monto_puja: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
  },
  fecha_puja: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
  id_lote: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  id_usuario: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  // NUEVO: Agrega el campo para vincular a la Transacción
  id_transaccion: {
    type: DataTypes.INTEGER,
    allowNull: true, // Puede ser nulo hasta que se procese el pago
  },
  // NUEVO: Agrega un estado para el registro de la puja
  estado_puja: {
    type: DataTypes.ENUM('activa', 'ganadora_pendiente', 'ganadora_pagada', 'perdedora', 'cancelada','cubierto_por_puja'),
    allowNull: false,
    defaultValue: 'activa'
  },
  id_suscripcion: {
      type: DataTypes.INTEGER,
      allowNull: false, // Es crucial que esta referencia no sea nula.
      references: {
        model: 'suscripcion_proyecto', // Nombre de la tabla de suscripciones
        key: 'id'
      },
    },
}, {
  tableName: 'puja',
});

module.exports = Puja;