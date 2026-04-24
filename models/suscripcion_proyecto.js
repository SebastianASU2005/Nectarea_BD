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
    token_consumido: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment:
        "true si el usuario ganó y pagó una subasta. Bloquea cualquier devolución futura del token.",
    },
    adhesion_completada: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment:
        "Indica si el usuario ya completó el pago de la adhesión (4% del valor móvil).",
    },
  },
  {
    tableName: "suscripcion_proyecto",
  },
);

module.exports = SuscripcionProyecto;
