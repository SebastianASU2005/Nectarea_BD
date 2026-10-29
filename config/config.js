require("dotenv").config();

const isProduction = process.env.NODE_ENV === "production";

// Si existe DATABASE_URL (Railway/producción), usar esa.
// Si no, caer a las credenciales individuales del .env local.
const baseConfig = process.env.DATABASE_URL
  ? {
      url: process.env.DATABASE_URL,
      dialect: "postgres",
      logging: false,
    }
  : {
      username: process.env.DB_USER || "postgres",
      password: String(process.env.DB_PASS || ""),
      database: process.env.DB_NAME || "crowdfunding_db",
      host: process.env.DB_HOST || "localhost",
      port: Number(process.env.DB_PORT) || 5432,
      dialect: "postgres",
      logging: false,
    };

module.exports = {
  development: {
    ...baseConfig,
    dialectOptions:
      process.env.DATABASE_URL && isProduction
        ? { ssl: { require: true, rejectUnauthorized: false } }
        : false,
  },
  production: {
    url: process.env.DATABASE_URL,
    dialect: "postgres",
    logging: false,
    dialectOptions: {
      ssl: { require: true, rejectUnauthorized: false },
    },
  },
};
