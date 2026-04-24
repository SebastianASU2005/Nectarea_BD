const { sequelize, DataTypes } = require("../config/database");
const baseAttributes = require("./base");

const PagoAdhesion = sequelize.define(
  "PagoAdhesion",
  {
    ...baseAttributes,
    id_adhesion: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "adhesion", key: "id" },
    },
    numero_cuota: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: "1..N, 1 para contado",
    },
    monto: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false,
    },
    fecha_vencimiento: {
      type: DataTypes.DATEONLY,
      allowNull: false,
      comment: "Día 10 del mes correspondiente",
    },
    fecha_pago: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    estado: {
      type: DataTypes.ENUM(
        "pendiente",
        "pagado",
        "vencido",
        "cancelado",
        "forzado",
      ),
      allowNull: false,
      defaultValue: "pendiente",
    },
    // Agregar campo motivo:
    motivo: {
      type: DataTypes.STRING(500),
      allowNull: true,
      defaultValue: null,
      comment: "Motivo de cancelación o pago forzado (usado por admin)",
    },
    // Para trackear la transacción y pago en pasarela
    id_transaccion: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: "transaccion", key: "id" },
      comment: "Transacción asociada al pago de esta cuota",
    },
  },
  {
    tableName: "pago_adhesion",
  },
);

module.exports = PagoAdhesion;
