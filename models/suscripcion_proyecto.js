const { sequelize, DataTypes } = require('../config/database');
const baseAttributes = require('./base');

const SuscripcionProyecto = sequelize.define('SuscripcionProyecto', {
  ...baseAttributes,
  // Clave foránea al usuario
  id_usuario: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  // Clave foránea al proyecto
  id_proyecto: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  // Cantidad de tokens disponibles para pujar en ese proyecto
  tokens_disponibles: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
  },
}, {
  tableName: 'suscripcion_proyecto',
});

module.exports = SuscripcionProyecto;