// Archivo: config/database.js (versión mejorada)
require("dotenv").config();
const { Sequelize, DataTypes, Op } = require("sequelize");

const isProduction = process.env.NODE_ENV === "production";

const sequelize = process.env.DATABASE_URL
  ? new Sequelize(process.env.DATABASE_URL, {
      dialect: "postgres",
      dialectOptions: {
        ssl: isProduction
          ? { require: true, rejectUnauthorized: false }
          : false,
      },
      logging: false,
      pool: {
        // 👈 NUEVO: Manejo de conexiones
        max: 10, // Máximo de conexiones en el pool
        min: 0, // Mínimo
        acquire: 30000, // Tiempo máximo para adquirir conexión (ms)
        idle: 10000, // Tiempo que una conexión puede estar inactiva
      },
    })
  : new Sequelize(
      process.env.DB_NAME,
      process.env.DB_USER,
      process.env.DB_PASS,
      {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        dialect: "postgres",
        logging: false,
        pool: { max: 10, min: 0, acquire: 30000, idle: 10000 },
      },
    );

module.exports = { sequelize, DataTypes, Op };
