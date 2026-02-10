// models/ContratoFirmado.js
const { sequelize, DataTypes } = require("../config/database");
const { Op } = require("sequelize");
const baseAttributes = require("./base");

const ContratoFirmado = sequelize.define(
  "ContratoFirmado",
  {
    ...baseAttributes,
    id_contrato_plantilla: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: "ID de la plantilla base utilizada.",
    },
    nombre_archivo: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: "Nombre del archivo PDF firmado.",
    },
    url_archivo: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: "URL del PDF firmado (único por usuario).",
    },
    hash_archivo_firmado: {
      type: DataTypes.STRING(64),
      allowNull: false,
      comment: "Hash SHA-256 del documento firmado.",
    },
    firma_digital: {
      type: DataTypes.TEXT,
      allowNull: false,
      comment: "Firma criptográfica del usuario.",
    },
    fecha_firma: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      comment: "Timestamp de la firma.",
    },
    id_proyecto: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    id_usuario_firmante: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: "Usuario que firmó el contrato.",
    },
    id_inversion_asociada: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: "Inversión que autoriza la firma (ÚNICA por contrato).",
    },
    id_suscripcion_asociada: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: "Suscripción que autoriza la firma (ÚNICA por contrato).",
    },
    estado_firma: {
      type: DataTypes.ENUM("FIRMADO", "REVOCADO", "INVALIDO"),
      allowNull: false,
      defaultValue: "FIRMADO",
    },
    ip_firma: {
      type: DataTypes.STRING(45),
      allowNull: true,
      comment: "IP desde donde se realizó la firma (auditoría).",
    },
    geolocalizacion_firma: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: "Coordenadas geográficas de la firma (auditoría).",
    },
  },
  {
    tableName: "contrato_firmado",
    indexes: [
      // 🔒 ÍNDICE 1: Una inversión solo puede tener UN contrato firmado
      {
        unique: true,
        fields: ["id_inversion_asociada"],
        where: {
          id_inversion_asociada: { [Op.ne]: null },
          estado_firma: "FIRMADO",
        },
        name: "idx_unique_inversion_contract",
      },
      // 🔒 ÍNDICE 2: Una suscripción solo puede tener UN contrato firmado
      {
        unique: true,
        fields: ["id_suscripcion_asociada"],
        where: {
          id_suscripcion_asociada: { [Op.ne]: null },
          estado_firma: "FIRMADO",
        },
        name: "idx_unique_suscripcion_contract",
      },
      // 📊 ÍNDICE ADICIONAL: Para búsquedas rápidas por usuario
      {
        fields: ["id_usuario_firmante"],
        name: "idx_user_contracts",
      },
      // 📊 ÍNDICE ADICIONAL: Para búsquedas rápidas por proyecto
      {
        fields: ["id_proyecto"],
        name: "idx_project_contracts",
      },
    ],
  },
);

module.exports = ContratoFirmado;
