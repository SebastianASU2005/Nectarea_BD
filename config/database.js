// Archivo: config/database.js
const { Sequelize, DataTypes } = require('sequelize');

// Reemplaza estos valores con la información de tu base de datos
const sequelize = new Sequelize('crowdfunding_db', 'postgres', '181818', {
  host: 'localhost',
  port: 5432,
  dialect: 'postgres',
});

module.exports = { sequelize, DataTypes };