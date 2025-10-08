const { sequelize, DataTypes } = require("../config/database");
const baseAttributes = require("./base");

const Proyecto = sequelize.define(
  "Proyecto",
  {
    ...baseAttributes, // Incluye los campos 'id' y 'activo'
    nombre_proyecto: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    descripcion: {
      type: DataTypes.TEXT,
    },
    tipo_inversion: {
      type: DataTypes.ENUM("directo", "mensual"),
      allowNull: false,
    },
    plazo_inversion: {
      type: DataTypes.INTEGER,
    },
    forma_juridica: {
      type: DataTypes.STRING(100),
    },
    monto_inversion: {
      type: DataTypes.DECIMAL(18, 2),
    },
    // NUEVO CAMPO: Tipo de moneda para el monto_inversion
    moneda: {
      type: DataTypes.STRING(10),
      allowNull: true,
      defaultValue: "USD",
    },
    suscripciones_actuales: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    obj_suscripciones: {
      type: DataTypes.INTEGER,
    },
    objetivo_notificado: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    estado_proyecto: {
      type: DataTypes.ENUM("En Espera", "En proceso", "Finalizado"),
      allowNull: false,
      defaultValue: "En Espera",
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
  },
  {
    tableName: "proyecto", // Nombre de la tabla en la base de datos
  }
);

module.exports = Proyecto;
