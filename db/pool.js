import "dotenv/config";
import pg from "pg";

const { Pool } = pg;

const isProduction = process.env.NODE_ENV === "production";

const connectionString =
  process.env.DATABASE_URL || process.env.POSTGRES_URL;

if (!connectionString) {
  throw new Error(
    "No se encontró DATABASE_URL ni POSTGRES_URL"
  );
}

const pool = new Pool({
  connectionString,
  ssl: isProduction
    ? {
        rejectUnauthorized: false
      }
    : false
});

export default pool;