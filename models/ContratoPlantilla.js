// models/ContratoPlantilla.js
const { sequelize, Op,DataTypes } = require("../config/database");
const baseAttributes = require("./base");

const ContratoPlantilla = sequelize.define(
  "ContratoPlantilla",
  {
    ...baseAttributes,
    nombre_archivo: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: "Nombre del archivo PDF de la plantilla.",
    },
    url_archivo: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: "URL donde se almacena el PDF de la plantilla.",
    },
    hash_archivo_original: {
      type: DataTypes.STRING(64),
      allowNull: false,
      comment: "Hash SHA-256 del PDF plantilla para verificar integridad.",
    },
    id_proyecto: {
      type: DataTypes.INTEGER,
      allowNull: true, // ✅ CORREGIDO: Puede ser NULL inicialmente
      comment: "Proyecto al que pertenece esta plantilla (NULL = sin asignar).",
    },
    version: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
      comment: "Versión de la plantilla (permite múltiples versiones).",
    },
    id_usuario_creacion: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: "Usuario administrador que creó la plantilla.",
    },
  },
  {
    tableName: "contrato_plantilla",
    indexes: [
      {
        unique: true,
        fields: ["id_proyecto", "version"],
        where: {
          id_proyecto: { [Op.ne]: null },
        },
      },
    ],
  }
);

module.exports = ContratoPlantilla;
