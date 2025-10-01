const { sequelize, DataTypes } = require('../config/database');
const baseAttributes = require('./base');
// No es necesario importar SuscripcionProyecto aquí si las asociaciones se configuran externamente.

const Pago = sequelize.define('Pago', {
  ...baseAttributes,
  // >>> CAMBIOS CLAVE: Añadir id_usuario y id_proyecto como atributos <<<
  id_usuario: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  id_proyecto: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  id_suscripcion: {
    type: DataTypes.INTEGER,
    allowNull: true,
    // Eliminamos 'references' de aquí. La asociación se define en configureAssociations.
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
