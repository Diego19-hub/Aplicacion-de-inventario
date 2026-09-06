import "../config/env.js";
import pg from "pg";
import fs from "node:fs";

const { Pool } = pg;

const isProduction = process.env.NODE_ENV === "production";

const databaseSsl = process.env.DATABASE_SSL;
const databaseTrustPrivateNetwork = process.env.DATABASE_TRUST_PRIVATE_NETWORK;

if (
  databaseSsl !== undefined
  && !["true", "false"].includes(databaseSsl)
) {
  throw new Error(
    "DATABASE_SSL debe ser true o false."
  );
}

if (
  databaseTrustPrivateNetwork !== undefined
  && !["true", "false"].includes(databaseTrustPrivateNetwork)
) {
  throw new Error(
    "DATABASE_TRUST_PRIVATE_NETWORK debe ser true o false."
  );
}

const trustPrivateNetwork = databaseTrustPrivateNetwork === "true";

if (isProduction && databaseSsl === "false" && !trustPrivateNetwork) {
  throw new Error(
    "DATABASE_SSL=false en producción requiere DATABASE_TRUST_PRIVATE_NETWORK=true."
  );
}

const useSsl =
  databaseSsl === "true"
  || (databaseSsl === undefined && isProduction);

function readDatabaseCa() {
  const configuredCa = process.env.DATABASE_SSL_CA?.trim();
  const rootCert = process.env.PGSSLROOTCERT?.trim();

  if (configuredCa) return configuredCa;
  if (!rootCert) return null;

  if (rootCert.includes("BEGIN CERTIFICATE")) return rootCert;

  try {
    return fs.readFileSync(rootCert, "utf8");
  } catch (error) {
    throw new Error(`No se pudo leer el certificado CA de PostgreSQL indicado por PGSSLROOTCERT: ${error.message}`);
  }
}

const databaseCa = useSsl ? readDatabaseCa() : null;

if (isProduction && useSsl && !databaseCa) {
  throw new Error(
    "La producción requiere DATABASE_SSL_CA o PGSSLROOTCERT para validar el certificado de PostgreSQL."
  );
}

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
        rejectUnauthorized: isProduction,
        ...(databaseCa ? { ca: databaseCa } : {})
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
