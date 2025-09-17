const { sequelize, DataTypes } = require('../config/database');
const baseAttributes = require('./base');
const SuscripcionProyecto = require('./suscripcion_proyecto');

const SuscripcionCancelada = sequelize.define('SuscripcionCancelada', {
  ...baseAttributes,
  id_suscripcion_original: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: SuscripcionProyecto,
      key: 'id',
    },
  },
  id_usuario: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  id_proyecto: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  meses_pagados: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },
  monto_pagado_total: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0.00,
  },
  fecha_cancelacion: {
    type: DataTypes.DATE,
    allowNull: false,
  },
}, {
  tableName: 'suscripcion_cancelada',
});

module.exports = SuscripcionCancelada;