const { sequelize, DataTypes } = require('../config/database');
const baseAttributes = require('./base');

const Proyecto = sequelize.define('Proyecto', {
  ...baseAttributes, // Incluye los campos 'id' y 'activo'
  nombre_proyecto: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  descripcion: {
    type: DataTypes.TEXT,
  },
  // CAMBIO CRUCIAL: Usamos ENUM para los tipos de inversión
  tipo_inversion: {
    type: DataTypes.ENUM('directo', 'mensual'),
    allowNull: false,
  },
  plazo_inversion: {
    type: DataTypes.INTEGER,
  },
  forma_juridica: {
    type: DataTypes.STRING(100),
  },
  monto_inversion: {
    type: DataTypes.DECIMAL(15, 2),
  },
  entrega_anticipada: {
    type: DataTypes.BOOLEAN,
  },
  // Estos campos ahora se usarían solo para el tipo de inversión 'mensual'
  suscripciones: {
    type: DataTypes.BOOLEAN,
  },
  obj_suscripciones: {
    type: DataTypes.INTEGER,
  },
  estado_proyecto: {
    type: DataTypes.STRING(50),
    allowNull: false,
  },
  fecha_inicio: {
    type: DataTypes.DATEONLY,
    allowNull: false,
  },
  fecha_cierre: {
    type: DataTypes.DATEONLY,
    allowNull: false,
  },
  pack_de_lotes: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
}, {
  tableName: 'proyecto', // Nombre de la tabla en la base de datos
});

module.exports = Proyecto;