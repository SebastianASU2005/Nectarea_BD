// Archivo: utils/baseAttributes.js
const { DataTypes } = require('sequelize');

const baseAttributes = {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false,
  },
  activo: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    allowNull: false,
  },
};

module.exports = baseAttributes;