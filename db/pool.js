import "../config/env.js";
import pg from "pg";

const { Pool } = pg;

const isProduction = process.env.NODE_ENV === "production";

const databaseSsl = process.env.DATABASE_SSL;

if (
  databaseSsl !== undefined
  && !["true", "false"].includes(databaseSsl)
) {
  throw new Error(
    "DATABASE_SSL debe ser true o false."
  );
}

const useSsl =
  databaseSsl === "true"
  || (databaseSsl === undefined && isProduction);

const connectionString =
  process.env.DATABASE_URL || process.env.POSTGRES_URL;

if (!connectionString) {
  throw new Error(
    "No se encontró DATABASE_URL ni POSTGRES_URL"
  );
}

function databaseOption(name, fallback) {
  const value = process.env[name];
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${name} debe ser un entero positivo.`);
  return parsed;
}

const pool = new Pool({
  connectionString,
  max: databaseOption("DATABASE_POOL_MAX", 10),
  idleTimeoutMillis: databaseOption("DATABASE_IDLE_TIMEOUT_MS", 10000),
  connectionTimeoutMillis: databaseOption("DATABASE_CONNECTION_TIMEOUT_MS", 5000),
  ssl: useSsl
    ? {
        rejectUnauthorized: false
      }
    : false
});

pool.on("error", (error) => {
  if (process.env.NODE_ENV === "development") console.error(`[db-pool] ${error.code || "pool error"}`);
});

if (process.env.NODE_ENV === "development") {
  const originalQuery = pool.query.bind(pool);
  pool.query = async (...args) => {
    const startedAt = process.hrtime.bigint();
    try {
      return await originalQuery(...args);
    } finally {
      const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      console.info(`[db-timing] query ${elapsedMs.toFixed(0)} ms`);
    }
  };

  const originalConnect = pool.connect.bind(pool);
  pool.connect = async (...args) => {
    const startedAt = process.hrtime.bigint();
    try {
      return await originalConnect(...args);
    } finally {
      const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      console.info(`[db-timing] checkout ${elapsedMs.toFixed(0)} ms`);
    }
  };
}

export default pool;
