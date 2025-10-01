const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database'); // Asegúrate de que esta ruta sea correcta
const SuscripcionProyecto = require('./suscripcion_proyecto'); // <-- NUEVO: Importamos el modelo

const ResumenCuenta = sequelize.define('ResumenCuenta', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  id_suscripcion: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: SuscripcionProyecto, // <-- ¡CORREGIDO! Referenciamos el objeto del modelo
      key: 'id',
    },
  },
  nombre_proyecto: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  meses_proyecto: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  cuotas_pagadas: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },
  cuotas_vencidas: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },
  porcentaje_pagado: {
    type: DataTypes.FLOAT,
    allowNull: false,
    defaultValue: 0.0,
  },
  detalle_cuota: {
    type: DataTypes.JSONB,
    allowNull: false,
  },
}, {
  tableName: 'resumenes_cuentas',
  timestamps: true,
});

module.exports = ResumenCuenta;
