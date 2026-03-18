// models/lote.js

const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const Lote = sequelize.define(
  "Lote",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    id_proyecto: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: "ID del proyecto al que pertenece el lote.",
    },
    nombre_lote: {
      type: DataTypes.STRING(255),
      allowNull: false,
      comment: "Nombre del lote.",
    },
    precio_base: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      comment: "Precio base para la subasta.",
    },
    estado_subasta: {
      type: DataTypes.ENUM("pendiente", "activa", "finalizada"),
      defaultValue: "pendiente",
      allowNull: false,
    },
    fecha_inicio: {
      type: DataTypes.DATE,
      comment: "Fecha de inicio de la subasta.",
    },
    fecha_fin: {
      type: DataTypes.DATE,
      comment: "Fecha de finalización de la subasta.",
    },
    activo: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      comment: "Indica si el lote está activo.",
    },
    id_puja_mas_alta: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: "ID de la puja más alta registrada para este lote.",
    },
    id_ganador: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: "ID del usuario ganador de la subasta.",
    },
    intentos_fallidos_pago: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false,
      comment: "Contador de veces que el ganador potencial ha incumplido el pago.",
    },
    excedente_visualizacion: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0,
      allowNull: false,
      comment: "Excedente de la puja ganadora para fines de visualización.",
    },
    excluir_estadisticas: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false,
      comment: "Si es true, el lote no aparece en rankings ni estadísticas de favoritos.",
    },

    // ── Ubicación geográfica ──────────────────────────────────────────
    latitud: {
      type: DataTypes.DECIMAL(10, 8),
      allowNull: true,
      comment: "Latitud de la ubicación del lote (ej: -32.889459)",
      validate: { min: -90, max: 90 },
    },
    longitud: {
      type: DataTypes.DECIMAL(11, 8),
      allowNull: true,
      comment: "Longitud de la ubicación del lote (ej: -68.845839)",
      validate: { min: -180, max: 180 },
    },

  
    map_url: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "URL embebida del mapa (Google Maps embed, OpenStreetMap, etc.)",
    },
  },
  {
    tableName: "lote",
    timestamps: true,
    createdAt: "fecha_creacion",
    updatedAt: "fecha_actualizacion",
  }
);

module.exports = Lote;