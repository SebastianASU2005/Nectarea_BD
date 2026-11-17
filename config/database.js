// Archivo: config/database.js (versión mejorada + tuning de pool para alta concurrencia)
require("dotenv").config();
const { Sequelize, DataTypes, Op } = require("sequelize");

const isProduction = process.env.NODE_ENV === "production";

// ============================================================
// ⚡ PERFORMANCE — Pool y timeouts configurables por variables de entorno
// ============================================================
// Regla de oro: (instancias de la app) x DB_POOL_MAX debe ser MENOR que `max_connections` de Postgres
// (Railway: 100 por defecto). Con 1 instancia, 20 es un valor seguro.
const toInt = (value, fallback) => {
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

const POOL_MAX = Math.max(1, toInt(process.env.DB_POOL_MAX, 20));
const POOL_MIN = Math.min(toInt(process.env.DB_POOL_MIN, 2), POOL_MAX);

const pool = {
  max: POOL_MAX,
  min: POOL_MIN, // conexiones calientes: evita el costo de handshake TCP+TLS en el primer pico
  acquire: toInt(process.env.DB_POOL_ACQUIRE_MS, 30000), // espera máxima por una conexión libre
  idle: toInt(process.env.DB_POOL_IDLE_MS, 10000),
  evict: 5000, // cada cuánto se revisan conexiones ociosas
};

// Timeouts del lado del servidor Postgres (0 = desactivado). Evitan que UNA consulta lenta
// o una transacción olvidada retengan una conexión del pool indefinidamente.
// Defaults generosos a propósito: los cron jobs (p. ej. generación mensual de cuotas) mantienen
// transacciones largas y envían emails SMTP dentro de ellas. Ajustar a la baja cuando se revisen.
const STATEMENT_TIMEOUT_MS = toInt(process.env.DB_STATEMENT_TIMEOUT_MS, 120000);
const IDLE_IN_TX_TIMEOUT_MS = toInt(process.env.DB_IDLE_IN_TX_TIMEOUT_MS, 300000);

const baseDialectOptions = {
  keepAlive: true, // detecta conexiones muertas (proxy de Railway) antes de usarlas
  keepAliveInitialDelayMillis: 10000,
  ...(STATEMENT_TIMEOUT_MS > 0 && { statement_timeout: STATEMENT_TIMEOUT_MS }),
  ...(IDLE_IN_TX_TIMEOUT_MS > 0 && {
    idle_in_transaction_session_timeout: IDLE_IN_TX_TIMEOUT_MS,
  }),
};

const sequelize = process.env.DATABASE_URL
  ? new Sequelize(process.env.DATABASE_URL, {
      dialect: "postgres",
      dialectOptions: {
        ...baseDialectOptions,
        ssl: isProduction
          ? { require: true, rejectUnauthorized: false }
          : false,
      },
      logging: false,
      pool,
    })
  : new Sequelize(
      process.env.DB_NAME,
      process.env.DB_USER,
      process.env.DB_PASS,
      {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        dialect: "postgres",
        dialectOptions: baseDialectOptions,
        logging: false,
        pool,
      },
    );

module.exports = { sequelize, DataTypes, Op };
