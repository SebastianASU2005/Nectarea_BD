const { sequelize, DataTypes } = require('../config/database');
const baseAttributes = require('./base');
const SuscripcionProyecto = require('./suscripcion_proyecto');

const Pago = sequelize.define('Pago', {
  ...baseAttributes,
  id_suscripcion: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: SuscripcionProyecto,
      key: 'id',
    },
    
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
    allowNull: true,
  },
  estado_pago: {
    type: DataTypes.ENUM('pendiente', 'pagado', 'vencido', 'cancelado', 'cubierto_por_puja'),
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
