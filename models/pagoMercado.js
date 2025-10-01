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
      unique: true, // Cada pago en la pasarela debería corresponder a una única Transaccion de nuestra app
      references: {
        model: "transaccion", // Nombre de la tabla de tu modelo Transaccion
        key: "id",
      },
    },
    // ID de la transacción o preferencia en la pasarela (Mercado Pago ID, Preference ID, etc.)
    id_transaccion_pasarela: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true,
    },
    monto_pagado: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },
    metodo_pasarela: {
      type: DataTypes.STRING, // 'mercadopago', 'stripe'
      allowNull: false,
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
        "en_proceso"
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
  }
);

module.exports = PagoMercado;
