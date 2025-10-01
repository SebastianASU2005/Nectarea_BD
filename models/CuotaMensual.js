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
      type: DataTypes.DECIMAL(15, 2),
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
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
    },
    total_del_plan: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
    },
    valor_mensual: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
    },
    carga_administrativa: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
    },
    iva_carga_administrativa: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
    },
    valor_mensual_final: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
    },
  },
  {
    tableName: "cuota_mensual",
  }
);

module.exports = CuotaMensual;
