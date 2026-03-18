// models/proyecto.js

const { sequelize, DataTypes } = require("../config/database");
const baseAttributes = require("./base");

const Proyecto = sequelize.define(
  "Proyecto",
  {
    ...baseAttributes,
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
    suscripciones_minimas: {
      type: DataTypes.INTEGER,
      allowNull: true,
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
    fecha_inicio_proceso: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    meses_restantes: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: null,
    },

    // ── Ubicación geográfica ──────────────────────────────────────────
    // latitud y longitud se mantienen por si en el futuro se necesitan
    // para lógica interna (distancias, filtros geográficos, etc.)
    latitud: {
      type: DataTypes.DECIMAL(10, 8),
      allowNull: true,
      comment: "Latitud de la ubicación del proyecto (ej: -32.889459)",
      validate: { min: -90, max: 90 },
    },
    longitud: {
      type: DataTypes.DECIMAL(11, 8),
      allowNull: true,
      comment: "Longitud de la ubicación del proyecto (ej: -68.845839)",
      validate: { min: -180, max: 180 },
    },

    map_url: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "URL embebida del mapa (Google Maps embed, OpenStreetMap, etc.)",
    },
  },
  {
    tableName: "proyecto",
  }
);

module.exports = Proyecto;