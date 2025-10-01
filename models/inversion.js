// Archivo: models/Inversion.js
const { sequelize, DataTypes } = require('../config/database');
const baseAttributes = require('./base');
const Proyecto = require('./proyecto');
const Usuario = require('./usuario');

const Inversion = sequelize.define('Inversion', {
  ...baseAttributes,
  monto: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
  },
  fecha_inversion: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
  estado: {
    type: DataTypes.ENUM('pendiente', 'pagado', 'fallido', 'reembolsado'),
    defaultValue: 'pendiente',
    allowNull: false,
  },
  id_usuario: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: Usuario,
      key: 'id',
    },
  },
  id_proyecto: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: Proyecto,
      key: 'id',
    },
  },
}, {
  tableName: 'inversion',
});



module.exports = Inversion;
