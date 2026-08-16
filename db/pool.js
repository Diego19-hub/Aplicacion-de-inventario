import "dotenv/config";
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

const pool = new Pool({
  connectionString,
  ssl: useSsl
    ? {
        rejectUnauthorized: false
      }
    : false
});

export default pool;