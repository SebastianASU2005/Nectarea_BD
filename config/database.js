// Archivo: config/database.js
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
      }
    );


module.exports = { sequelize, DataTypes, Op };