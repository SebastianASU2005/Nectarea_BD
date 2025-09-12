const { sequelize, DataTypes } = require('../config/database');
const baseAttributes = require('./base');

const Contrato = sequelize.define('Contrato', {
  ...baseAttributes,
  nombre_archivo: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'Nombre del archivo PDF original.',
  },
  url_archivo: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'URL o ruta donde se almacena el archivo PDF.',
  },
  firma_digital: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Datos de la firma digital en formato Base64. Puede ser nulo hasta que se firme.',
  },
  id_proyecto: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  id_usuario_firmante: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'ID del usuario que ha firmado el contrato.',
  },
}, {
  tableName: 'contrato',
});

module.exports = Contrato;
