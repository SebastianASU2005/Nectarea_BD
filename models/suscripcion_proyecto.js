const { sequelize, DataTypes } = require("../config/database");
const baseAttributes = require("./base");

const SuscripcionProyecto = sequelize.define(
  "SuscripcionProyecto",
  {
    ...baseAttributes,
    id_usuario: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    id_proyecto: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    tokens_disponibles: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },
    // NUEVO: Meses que el usuario individual debe pagar.
    meses_a_pagar: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    // NUEVO: Saldo a favor por pago excedente en la subasta.
    saldo_a_favor: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      defaultValue: 0.0,
    },
    monto_total_pagado: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      defaultValue: 0.0,
    },
  },
  {
    tableName: "suscripcion_proyecto",
  }
);

module.exports = SuscripcionProyecto;
