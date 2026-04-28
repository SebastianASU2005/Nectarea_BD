const { sequelize, DataTypes } = require("../config/database");
const baseAttributes = require("./base");

const Adhesion = sequelize.define(
  "Adhesion",
  {
    ...baseAttributes,
    id_usuario: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "usuario", key: "id" },
    },
    id_proyecto: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "proyecto", key: "id" },
    },
    // Datos congelados en el momento de la adhesión
    valor_movil_referencia: {
      type: DataTypes.DECIMAL(18, 8),
      allowNull: false,
      comment: "Valor móvil (cemento * unidades) al momento de adherirse",
    },
    porcentaje_adhesion: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
      defaultValue: 4.0,
      comment: "Porcentaje fijo, ej: 4.00%",
    },
    monto_total_adhesion: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false,
      comment: "Cálculo: valor_movil * (porcentaje/100)",
    },
    plan_pago: {
      type: DataTypes.ENUM("contado", "3_cuotas", "6_cuotas"),
      allowNull: false,
    },
    cuotas_totales: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: "1, 6 o 12",
    },
    cuotas_pagadas: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    estado: {
      type: DataTypes.ENUM("pendiente", "en_curso", "completada", "cancelada"),
      allowNull: false,
      defaultValue: "pendiente",
    },
    fecha_completada: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "Fecha en que se pagó la última cuota",
    },
    id_suscripcion: {
      type: DataTypes.INTEGER,
      allowNull: false,
      unique: true,
      references: {
        model: "suscripcion_proyecto",
        key: "id",
      },
      comment:
        "Suscripción asociada a esta adhesión (creada al inicio de la adhesión, reserva cupo)",
    },
  },
  {
    tableName: "adhesion",
    indexes: [
      { fields: ["id_usuario"] },
      { fields: ["id_proyecto"] },
      { fields: ["estado"] },
    ],
  },
);

module.exports = Adhesion;
