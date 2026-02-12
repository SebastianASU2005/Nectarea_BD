// Archivo: pago.js (Modelo Corregido)

const { sequelize, DataTypes } = require("../config/database");
const baseAttributes = require("./base");

const Pago = sequelize.define(
  "Pago",
  {
    ...baseAttributes,

    id_suscripcion: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    // ✅ AGREGAR ESTOS CAMPOS
    id_usuario: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'usuario', // nombre de la tabla de usuarios
        key: 'id'
      }
    },
    id_proyecto: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'proyecto', // nombre de la tabla de proyectos
        key: 'id'
      }
    },
    // FIN DE CAMPOS NUEVOS ✅
    monto: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      get() {
        const rawValue = this.getDataValue("monto");
        return rawValue === null ? null : parseFloat(rawValue);
      },
    },
    fecha_vencimiento: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    fecha_pago: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    estado_pago: {
      type: DataTypes.ENUM(
        "pendiente",
        "pagado",
        "vencido",
        "cancelado",
        "cubierto_por_puja"
      ),
      allowNull: false,
      defaultValue: "pendiente",
    },
    mes: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
  },
  {
    tableName: "pago",
  }
);

module.exports = Pago;