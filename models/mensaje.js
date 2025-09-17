const { sequelize, DataTypes } = require('../config/database');
const baseAttributes = require('./base');

const Mensaje = sequelize.define('Mensaje', {
  ...baseAttributes,
  id_remitente: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'ID del usuario que envía el mensaje.',
  },
  id_receptor: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'ID del usuario que recibe el mensaje.',
  },
  contenido: {
    type: DataTypes.TEXT,
    allowNull: false,
    comment: 'Contenido del mensaje.',
  },
  fecha_envio: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    comment: 'Fecha y hora en que se envió el mensaje.',
  },
  leido: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    comment: 'Indica si el mensaje ha sido leído por el receptor.',
  },
}, {
  tableName: 'mensaje',
});

module.exports = Mensaje;
