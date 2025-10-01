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
  // NUEVO: Hash criptográfico (SHA-256) del documento para asegurar su integridad.
  hash_archivo_original: {
    type: DataTypes.STRING(64), 
    allowNull: false,
    comment: 'Hash del contenido binario del PDF al momento de la creación/firma.',
  },
  firma_digital: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Datos de la firma digital criptográfica.',
  },
  fecha_firma: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Fecha en que se firmó el contrato.',
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