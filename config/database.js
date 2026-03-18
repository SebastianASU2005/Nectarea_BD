// Archivo: config/database.js

require("dotenv").config();
const { Sequelize, DataTypes, Op } = require("sequelize");

// ============================================================
// Railway inyecta DATABASE_URL automáticamente cuando el
// servicio Node.js y la DB están en el mismo proyecto.
// En desarrollo local se usan las variables individuales.
// ============================================================

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

(async () => {
  try {
    await sequelize.authenticate();
    console.log("¡Conexión a la base de datos establecida correctamente!");
  } catch (error) {
    console.error("Error al conectar a la base de datos:", error);
  }
})();

module.exports = { sequelize, DataTypes, Op };