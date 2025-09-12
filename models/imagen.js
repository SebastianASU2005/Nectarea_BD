const { sequelize, DataTypes } = require('../config/database');
const baseAttributes = require('./base');

const Imagen = sequelize.define('Imagen', {
  ...baseAttributes, // Incluye los campos 'id' y 'activo'
  url: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  descripcion: {
    type: DataTypes.STRING(255),
  },
  // La clave foránea se definirá en el archivo de relaciones
  id_proyecto: {
    type: DataTypes.INTEGER,
    allowNull: true, // Una imagen puede no tener un proyecto
  },
  // NUEVA CLAVE FORÁNEA: Un ID de lote para asociar la imagen
  id_lote: {
    type: DataTypes.INTEGER,
    allowNull: true, // Una imagen puede no tener un lote
  },
}, {
  tableName: 'imagen',
});

module.exports = Imagen;