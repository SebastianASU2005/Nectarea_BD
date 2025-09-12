// Archivo: models/Lote.js
const { sequelize, DataTypes } = require('../config/database');
const baseAttributes = require('./base');

const Lote = sequelize.define('Lote', {
  ...baseAttributes, // Incluye los campos 'id' y 'activo'
  nombre_lote: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  descripcion: {
    type: DataTypes.TEXT,
  },
  valor_inicial_subasta: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
  },
  estado_lote: {
    type: DataTypes.STRING(50),
    allowNull: false,
  },
  valor_actual_subasta: {
    type: DataTypes.DECIMAL(15, 2),
  },
  fecha_inicio_subasta: {
    type: DataTypes.DATE, // 'TIMESTAMP' en SQL se mapea a 'DATE' en Sequelize
    defaultValue: DataTypes.NOW, // Establece la fecha y hora actuales por defecto
  },
  fecha_cierre_subasta: {
    type: DataTypes.DATE,
  },
  id_ganador: {
    type: DataTypes.INTEGER,
    // La clave foránea se definirá en el archivo de relaciones
  },
}, {
  tableName: 'lote', // Nombre de la tabla en la base de datos
});

module.exports = Lote;