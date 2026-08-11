import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import "dotenv/config";

const { Client } = pg;

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
);
const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
const forbiddenDatabaseNames = new Set([
  "inventory_boxing",
  "postgres",
  "template0",
  "template1"
]);
const databaseNamePattern = /^[a-z0-9_]+_test$/;
const migrationFiles = [
  "001_multitenancy_up.sql",
  "002_simplify_business_roles_up.sql",
  "003_add_item_sku_up.sql",
  "004_archive_items_up.sql",
  "005_inventory_movements_up.sql",
  "006_suppliers_up.sql",
  "007_locations_and_balances_up.sql",
  "008_inventory_transfers_up.sql",
  "009_stock_thresholds_up.sql",
  "010_harden_database_access_up.sql"
];
const requiredTables = [
  "users",
  "businesses",
  "business_members",
  "categories",
  "items",
  "inventory_movements",
  "business_locations",
  "inventory_balances",
  "inventory_transfers",
  "suppliers",
  "inventory_stock_thresholds"
];

function normalizedHost(url) {
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");

  return localHosts.has(host) ? "local" : host;
}

function normalizedPort(url) {
  return url.port || "5432";
}

function databaseNameFromUrl(url) {
  const pathname = decodeURIComponent(url.pathname);

  if (!/^\/[a-z0-9_]+$/.test(pathname)) {
    throw new Error("TEST_DATABASE_URL debe incluir un nombre de base válido.");
  }

  const databaseName = pathname.slice(1);

  if (forbiddenDatabaseNames.has(databaseName)) {
    throw new Error("TEST_DATABASE_URL apunta a una base protegida.");
  }

  if (!databaseNamePattern.test(databaseName)) {
    throw new Error("TEST_DATABASE_URL debe incluir una base local con sufijo _test.");
  }

  return databaseName;
}

function quoteIdentifier(identifier) {
  if (!databaseNamePattern.test(identifier) || forbiddenDatabaseNames.has(identifier)) {
    throw new Error("El identificador de la base de pruebas no es válido.");
  }

  return `"${identifier}"`;
}

function pointsToSameDatabase(testUrl, applicationUrl) {
  return normalizedHost(testUrl) === normalizedHost(applicationUrl)
    && normalizedPort(testUrl) === normalizedPort(applicationUrl)
    && testUrl.pathname === applicationUrl.pathname;
}

function getTestDatabaseConfig() {
  const connectionString = process.env.TEST_DATABASE_URL;

  if (!connectionString) {
    throw new Error("Falta TEST_DATABASE_URL para preparar la base de integración.");
  }

  let testUrl;

  try {
    testUrl = new URL(connectionString);
  } catch {
    throw new Error("TEST_DATABASE_URL no es una URL válida.");
  }

  if (!["postgres:", "postgresql:"].includes(testUrl.protocol)) {
    throw new Error("TEST_DATABASE_URL debe usar el protocolo PostgreSQL.");
  }

  if (testUrl.search || testUrl.hash) {
    throw new Error("TEST_DATABASE_URL no puede incluir parámetros de consulta ni fragmentos.");
  }

  if (normalizedHost(testUrl) !== "local") {
    throw new Error("TEST_DATABASE_URL solo puede apuntar a localhost, 127.0.0.1 o ::1.");
  }

  const databaseName = databaseNameFromUrl(testUrl);

  quoteIdentifier(databaseName);

  if (process.env.DATABASE_URL) {
    try {
      const applicationUrl = new URL(process.env.DATABASE_URL);

      if (pointsToSameDatabase(testUrl, applicationUrl)) {
        throw new Error("TEST_DATABASE_URL no puede apuntar a la misma base que DATABASE_URL.");
      }
    } catch (error) {
      if (error.message === "TEST_DATABASE_URL no puede apuntar a la misma base que DATABASE_URL.") {
        throw error;
      }
    }
  }

  const adminUrl = new URL(testUrl);
  adminUrl.pathname = "/postgres";

  return {
    connectionString: testUrl.toString(),
    adminConnectionString: adminUrl.toString(),
    databaseName
  };
}

async function closeQuietly(client) {
  if (!client) return;

  try {
    await client.end();
  } catch {
    // El error de preparación original tiene prioridad sobre un cierre fallido.
  }
}

async function removeDatabase(config) {
  const adminClient = new Client({ connectionString: config.adminConnectionString });

  try {
    await adminClient.connect();
    await adminClient.query(
      "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
      [config.databaseName]
    );
    await adminClient.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(config.databaseName)}`);
  } finally {
    await closeQuietly(adminClient);
  }
}

async function executeSqlFile(client, relativePath) {
  const sql = await readFile(path.join(projectRoot, relativePath), "utf8");
  await client.query(sql);
}

async function assertRequiredTables(client) {
  const result = await client.query(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename = ANY($1::text[])",
    [requiredTables]
  );
  const found = new Set(result.rows.map((row) => row.tablename));
  const missing = requiredTables.filter((tableName) => !found.has(tableName));

  if (missing.length) {
    throw new Error(`Faltan tablas requeridas en la base de pruebas: ${missing.join(", ")}.`);
  }
}

export async function createTestDatabase() {
  const config = getTestDatabaseConfig();
  let adminClient;
  let testClient;

  try {
    adminClient = new Client({ connectionString: config.adminConnectionString });
    await adminClient.connect();
    await adminClient.query(
      "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
      [config.databaseName]
    );
    await adminClient.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(config.databaseName)}`);
    await adminClient.query(`CREATE DATABASE ${quoteIdentifier(config.databaseName)}`);

    testClient = new Client({ connectionString: config.connectionString });
    await testClient.connect();
    await executeSqlFile(testClient, "db/auth-schema.sql");
    await executeSqlFile(testClient, "db/schema.sql");
    await testClient.query(
      "INSERT INTO public.users (username, email, password_hash, role) VALUES ($1, $2, $3, $4)",
      ["test_admin", "test-admin@example.test", "integration-tests-password-hash-disabled", "admin"]
    );

    for (const migrationFile of migrationFiles) {
      await executeSqlFile(testClient, path.join("db/migrations", migrationFile));
    }

    await assertRequiredTables(testClient);
    return { databaseName: config.databaseName };
  } catch (error) {
    await closeQuietly(testClient);
    testClient = null;
    await closeQuietly(adminClient);
    adminClient = null;

    try {
      await removeDatabase(config);
    } catch {
      // Se conserva el error original de preparación.
    }

    throw error;
  } finally {
    await closeQuietly(testClient);
    await closeQuietly(adminClient);
  }
}

export async function dropTestDatabase() {
  const config = getTestDatabaseConfig();
  await removeDatabase(config);
}
