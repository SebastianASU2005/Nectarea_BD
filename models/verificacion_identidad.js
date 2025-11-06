// models/verificacion_identidad.js
const { sequelize, DataTypes } = require("../config/database");
const baseAttributes = require("./base");

const VerificacionIdentidad = sequelize.define(
  "VerificacionIdentidad",
  {
    ...baseAttributes, // ✅ Ahora incluye id y activo
    id_usuario: {
      type: DataTypes.INTEGER,
      allowNull: false,
      unique: true,
    },
    // Datos del documento de identidad
    tipo_documento: {
      type: DataTypes.ENUM("DNI", "PASAPORTE", "LICENCIA"),
      allowNull: false,
    },
    numero_documento: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    // Selfie con documento
    url_foto_documento_frente: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: "Foto del frente del documento",
    },
    url_foto_documento_dorso: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    url_foto_selfie_con_documento: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: "Selfie sosteniendo el documento",
    },
    url_video_verificacion: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: "Video de verificación (opcional)",
    },
    // Datos extraídos (puede ser manual o con OCR)
    nombre_completo: DataTypes.STRING,
    fecha_nacimiento: DataTypes.DATEONLY,
    // Estado de la verificación
    estado_verificacion: {
      type: DataTypes.ENUM("PENDIENTE", "APROBADA", "RECHAZADA"),
      allowNull: false,
      defaultValue: "PENDIENTE",
    },
    // Quién verificó (admin)
    id_verificador: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: "Admin que aprobó/rechazó",
    },
    fecha_verificacion: DataTypes.DATE,
    motivo_rechazo: DataTypes.TEXT,
    // Geolocalización en el momento de la verificación
    latitud_verificacion: DataTypes.DECIMAL(10, 8),
    longitud_verificacion: DataTypes.DECIMAL(11, 8),
    ip_verificacion: DataTypes.STRING(45),
  },
  {
    tableName: "verificacion_identidad",
  }
);

module.exports = VerificacionIdentidad;