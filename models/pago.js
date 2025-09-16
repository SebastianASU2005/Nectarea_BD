// Archivo: models/Pago.js
const { sequelize, DataTypes } = require('../config/database');
const baseAttributes = require('./base');
const SuscripcionProyecto = require('./suscripcion_proyecto');

const Pago = sequelize.define('Pago', {
  ...baseAttributes, // Incluye los campos 'id' y 'activo'
  // Clave foránea que se relaciona con la suscripción del proyecto
  id_suscripcion: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: SuscripcionProyecto,
      key: 'id',
    },
    onDelete: 'CASCADE', // Si se elimina la suscripción, se eliminan los pagos
  },
  monto: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
  },
  fecha_vencimiento: {
    type: DataTypes.DATEONLY,
    allowNull: false,
  },
  fecha_pago: {
    type: DataTypes.DATEONLY,
    allowNull: true, // Puede ser nulo si el pago aún no se ha realizado
  },
  estado_pago: {
    type: DataTypes.ENUM('pendiente', 'pagado', 'vencido', 'cancelado'),
    allowNull: false,
    defaultValue: 'pendiente',
  },
  mes: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
}, {
  tableName: 'pago',
});

module.exports = Pago;