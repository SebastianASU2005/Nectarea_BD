const { Sequelize, DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const Proyecto = require('./proyecto');

const Lote = sequelize.define('Lote', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  id_proyecto: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'ID del proyecto al que pertenece el lote.'
  },
  nombre_lote: {
    type: DataTypes.STRING(255),
    allowNull: false,
    comment: 'Nombre del lote.'
  },
  precio_base: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    comment: 'Precio base para la subasta.'
  },
  estado_subasta: {
    type: DataTypes.ENUM('pendiente', 'activa', 'finalizada'),
    defaultValue: 'pendiente',
    allowNull: false,
    // Eliminado temporalmente para evitar el error de sincronización
    // comment: 'Estado actual de la subasta del lote.'
  },
  fecha_inicio: {
    type: DataTypes.DATE,
    comment: 'Fecha de inicio de la subasta.'
  },
  fecha_fin: {
    type: DataTypes.DATE,
    comment: 'Fecha de finalización de la subasta.'
  },
  activo: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    comment: 'Indica si el lote está activo.'
  },
}, {
  tableName: 'lote',
  timestamps: true,
  createdAt: 'fecha_creacion',
  updatedAt: 'fecha_actualizacion'
});

module.exports = Lote;