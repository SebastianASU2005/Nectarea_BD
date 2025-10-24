// Archivo: config/database.js

require("dotenv").config();
// 1. IMPORTA 'Op' de sequelize
const { Sequelize, DataTypes, Op } = require("sequelize");

// Usar variables de entorno para las credenciales de la base de datos
const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASS,
  {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    dialect: "postgres",
  }
);

// Verificar la conexión a la base de datos (opcional, pero recomendable)
(async () => {
  try {
    await sequelize.authenticate();
    console.log("¡Conexión a la base de datos establecida correctamente!");
  } catch (error) {
    console.error("Error al conectar a la base de datos:", error);
  }
})();

// 2. EXPORTA 'Op' junto con sequelize y DataTypes
module.exports = { sequelize, DataTypes, Op }; // ✅ ¡CORREGIDO!
