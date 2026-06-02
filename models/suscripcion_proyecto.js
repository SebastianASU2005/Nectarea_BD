const SuscripcionProyecto = sequelize.define(
  "SuscripcionProyecto",
  {
    ...baseAttributes,
    id_usuario: { type: DataTypes.INTEGER, allowNull: false },
    id_proyecto: { type: DataTypes.INTEGER, allowNull: false },
    tokens_disponibles: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },
    meses_a_pagar: { type: DataTypes.INTEGER, allowNull: false },
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
    },
    adhesion_completada: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    standby_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    standby_end_date: { type: DataTypes.DATEONLY, allowNull: true },
  },
  {
    tableName: "suscripcion_proyecto",
    hooks: {
      // ✅ Ahora sí está en el lugar correcto
      beforeCreate: (instance) => {
        if (!instance.adhesion_completada && instance.tokens_disponibles > 0) {
          instance.tokens_disponibles = 0;
        }
      },
      beforeUpdate: (instance) => {
        if (!instance.adhesion_completada && instance.tokens_disponibles > 0) {
          instance.tokens_disponibles = 0;
        }
      },
    },
  },
);
