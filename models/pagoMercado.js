const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Este modelo almacena la información directa de la pasarela de pago (Mercado Pago u otras)
// Sirve para transacciones únicas (Inversión, Puja) o el primer pago de una Suscripción.
const PagoMercado = sequelize.define(
  "PagoMercado",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    // ID de la Transacción en nuestra base de datos (clave de negocio)
    id_transaccion: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    // ID de la transacción o preferencia en la pasarela (Mercado Pago ID, Preference ID, etc.)
    id_transaccion_pasarela: {
      type: DataTypes.STRING,
      allowNull: true,
      // ⚡ El UNIQUE se declara abajo en `indexes` con nombre fijo. Con `unique: true` aquí,
      // sync({ alter: true }) agregaba un constraint idéntico NUEVO en cada arranque.
    },
    monto_pagado: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
    },
    metodo_pasarela: {
      type: DataTypes.STRING, // 'mercadopago', 'stripe'
      allowNull: false,
    },
    moneda: {
      type: DataTypes.STRING(3),
      allowNull: false,
      defaultValue: "ARS",
      validate: { isIn: [["ARS", "USD"]] },
    },
    tipo_medio_pago: {
      type: DataTypes.STRING, // Ej: 'credit_card', 'bank_transfer', 'cash'
      allowNull: true,
    },
    estado: {
      type: DataTypes.ENUM(
        "pendiente",
        "aprobado",
        "rechazado",
        "devuelto",
        "en_proceso",
      ),
      allowNull: false,
      defaultValue: "pendiente",
    },
    fecha_aprobacion: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    detalles_raw: {
      type: DataTypes.JSON, // Para guardar el objeto completo del webhook/API
      allowNull: true,
    },
  },
  {
    tableName: "pagos_mercado",
    timestamps: true,
    indexes: [
      {
        unique: true,
        // Mismo nombre que el constraint que Postgres ya creó → alter lo reconoce y no lo duplica.
        name: "pagos_mercado_id_transaccion_pasarela_key",
        fields: ["id_transaccion_pasarela"],
      },
    ],
  },
);

module.exports = PagoMercado;
