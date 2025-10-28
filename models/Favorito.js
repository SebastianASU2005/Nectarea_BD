// models/favorito.js
const { Sequelize, DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Favorito = sequelize.define('Favorito', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  id_usuario: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'ID del usuario que marcó como favorito.'
  },
  id_lote: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'ID del lote marcado como favorito.'
  }
}, {
  tableName: 'favorito',
  timestamps: true,
  createdAt: 'fecha_creacion',
  updatedAt: 'fecha_actualizacion',
  indexes: [
    {
      unique: true,
      fields: ['id_usuario', 'id_lote'],
      name: 'unique_usuario_lote_favorito'
    }
  ]
});

module.exports = Favorito;