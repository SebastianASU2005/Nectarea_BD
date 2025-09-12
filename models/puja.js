// Archivo: models/Puja.js
const { sequelize, DataTypes } = require('../config/database');
const baseAttributes = require('./base');

const Puja = sequelize.define('Puja', {
  ...baseAttributes, // Incluye los campos 'id' y 'activo'
  monto_puja: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
  },
  fecha_puja: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW, // Establece la fecha y hora actuales por defecto
  },
  id_lote: {
    type: DataTypes.INTEGER,
    allowNull: false,
    // La clave foránea se definirá en el archivo de relaciones
  },
  id_usuario: {
    type: DataTypes.INTEGER,
    allowNull: false,
    // La clave foránea se definirá en el archivo de relaciones
  },
}, {
  tableName: 'puja', // Nombre de la tabla en la base de datos
});

module.exports = Puja;