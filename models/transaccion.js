// Archivo: models/Transaccion.js

const { sequelize, DataTypes } = require("../config/database");
const baseAttributes = require("./base");

const Transaccion = sequelize.define(
  "Transaccion",
  {
    ...baseAttributes,
    tipo_transaccion: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    monto: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
    },
    fecha_transaccion: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    id_usuario: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    id_proyecto: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },

    // 🛑 CAMBIOS CLAVE AQUÍ: Eliminamos id_pago y lo reemplazamos por dos campos específicos.

    // 1. Clave Foránea a la tabla de Pagos de Mensualidad (el modelo 'Pago')
    id_pago_mensual: {
      type: DataTypes.INTEGER,
      allowNull: true,
      // Nota: La definición de la FK final se hace en models/associations.js
    },

    // 2. Clave Foránea a la tabla de Pagos de Pasarela (el modelo 'PagoMercado')
    id_pago_pasarela: {
      type: DataTypes.INTEGER,
      allowNull: true,
      // Nota: La definición de la FK final se hace en models/associations.js
    },

    // FIN DE CAMBIOS CLAVE

    id_inversion: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    id_puja: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    estado_transaccion: {
      type: DataTypes.ENUM("pendiente", "pagado", "fallido", "reembolsado","expirado","rechazado_proyecto_cerrado","rechazado_por_capacidad","en_proceso"),
      allowNull: false,
      defaultValue: "pendiente",
    },
  },
  {
    tableName: "transaccion",
  }
);

module.exports = Transaccion;
