const { sequelize, DataTypes } = require("../config/database");
const Proyecto = require("./proyecto");

const CuotaMensual = sequelize.define(
  "CuotaMensual",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    id_proyecto: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: Proyecto,
        key: "id",
      },
    },
    nombre_proyecto: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    nombre_cemento_cemento: {
      // Nuevo campo para el nombre del cemento
      type: DataTypes.STRING(255),
      allowNull: true, // Lo hacemos opcional por si no se provee
    },
    valor_cemento_unidades: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    valor_cemento: {
      // Aumentado a DECIMAL(18, 2) para mayor capacidad en el valor por unidad
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false,
    },
    total_cuotas_proyecto: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    porcentaje_plan: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
    },
    porcentaje_administrativo: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
    },
    porcentaje_iva: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
    },
    valor_movil: {
      // Aumentado a DECIMAL(18, 2)
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false,
    },
    total_del_plan: {
      // Aumentado a DECIMAL(18, 2)
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false,
    },
    valor_mensual: {
      // Aumentado a DECIMAL(18, 2)
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false,
    },
    carga_administrativa: {
      // Aumentado a DECIMAL(18, 2)
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false,
    },
    iva_carga_administrativa: {
      // Aumentado a DECIMAL(18, 2)
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false,
    },
    valor_mensual_final: {
      // Aumentado a DECIMAL(18, 2)
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false,
    },
  },
  {
    tableName: "cuota_mensual",
  }
);

module.exports = CuotaMensual;
