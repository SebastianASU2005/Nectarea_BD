// models/audit_log.js
const { sequelize, DataTypes } = require("../config/database");
const baseAttributes = require("./base");

const AuditLog = sequelize.define(
  "AuditLog",
  {
    ...baseAttributes, // id, activo (aunque activo quizás no sea relevante, se puede omitir)
    // Si no quieres heredar 'activo', define solo id:
    // id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

    usuario_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: "ID del usuario que realizó la acción (admin o sistema)",
    },
    accion: {
      type: DataTypes.STRING(100),
      allowNull: false,
      comment: "Ej: FORZAR_PAGO, CANCELAR_ADHESION, MODIFICAR_MONTO",
    },
    entidad_tipo: {
      type: DataTypes.STRING(50),
      allowNull: false,
      comment:
        "Nombre de la tabla/modelo afectado: Adhesion, PagoAdhesion, SuscripcionProyecto, etc.",
    },
    entidad_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: "ID del registro afectado",
    },
    datos_previos: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: "Estado completo o campos relevantes antes del cambio",
    },
    datos_nuevos: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: "Estado completo o campos relevantes después del cambio",
    },
    motivo: {
      type: DataTypes.STRING(500),
      allowNull: true,
      comment: "Razón de la acción (ingresada por el admin)",
    },
    ip_origen: {
      type: DataTypes.STRING(45),
      allowNull: true,
      comment: "Dirección IP del administrador que ejecuta la acción",
    },
    // Campo adicional útil: user_agent (opcional)
    user_agent: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "User-Agent del navegador/cliente",
    },
  },
  {
    tableName: "audit_log",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: false, // La auditoría no se actualiza, solo se inserta
    indexes: [
      { fields: ["entidad_tipo", "entidad_id"] }, // Búsqueda por entidad
      { fields: ["created_at"] }, // Limpieza por fecha
      { fields: ["usuario_id"] }, // Auditoría por admin
      { fields: ["accion"] }, // Filtrar por tipo de acción
    ],
  },
);

module.exports = AuditLog;
