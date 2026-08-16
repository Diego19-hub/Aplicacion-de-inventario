import "dotenv/config";

import bcrypt from "bcrypt";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

import { getMigrationInventory } from "../db/migrationFiles.js";
import { extractMigrationBody } from "../db/migrationRunner.js";

const { Client } = pg;

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationHistoryLockKey = 781042261;
const expectedLatestMigrationVersion = 14;
const bootstrapConfirmationVariable = "DATABASE_BOOTSTRAP_CONFIRM";
const bootstrapUserVariables = {
  username: "BOOTSTRAP_SUPER_ADMIN_USERNAME",
  email: "BOOTSTRAP_SUPER_ADMIN_EMAIL",
  password: "BOOTSTRAP_SUPER_ADMIN_PASSWORD"
};

function getDatabaseUrl() {
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;

  if (!connectionString) {
    throw new Error("Falta DATABASE_URL o POSTGRES_URL para inicializar la base.");
  }

  return connectionString;
}

function getDatabaseName(connectionString) {
  const url = new URL(connectionString);
  const databaseName = decodeURIComponent(url.pathname.replace(/^\/+/, ""));

  if (!databaseName) {
    throw new Error("La URL de PostgreSQL debe incluir el nombre de la base.");
  }

  return databaseName;
}

function collectSensitiveValues() {
  const values = [
    process.env.DATABASE_URL,
    process.env.POSTGRES_URL,
    process.env[bootstrapUserVariables.password]
  ].filter(Boolean);

  for (const connectionString of [process.env.DATABASE_URL, process.env.POSTGRES_URL]) {
    if (!connectionString) continue;

    try {
      const url = new URL(connectionString);

      if (url.username) values.push(decodeURIComponent(url.username));
      if (url.password) values.push(decodeURIComponent(url.password));
    } catch {
      // La validación principal reportará la URL inválida sin exponerla.
    }
  }

  return values.filter((value) => value.length >= 3);
}

function sanitizeErrorMessage(message) {
  return collectSensitiveValues().reduce(
    (safeMessage, sensitiveValue) => safeMessage.replaceAll(sensitiveValue, "[oculto]"),
    message
  );
}

function requireExactDatabaseConfirmation(databaseName) {
  const confirmation = process.env[bootstrapConfirmationVariable];

  if (confirmation !== databaseName) {
    throw new Error(
      `Para inicializar esta base define ${bootstrapConfirmationVariable}=${databaseName}.`
    );
  }
}

function normalizeBootstrapUser() {
  const username = process.env[bootstrapUserVariables.username]?.trim();
  const email = process.env[bootstrapUserVariables.email]?.trim().toLowerCase();
  const password = process.env[bootstrapUserVariables.password];

  if (!username) {
    throw new Error(`Falta ${bootstrapUserVariables.username}.`);
  }

  if (!email) {
    throw new Error(`Falta ${bootstrapUserVariables.email}.`);
  }

  if (!password) {
    throw new Error(`Falta ${bootstrapUserVariables.password}.`);
  }

  if (username.length > 30) {
    throw new Error(`${bootstrapUserVariables.username} no puede exceder 30 caracteres.`);
  }

  if (email.length > 254 || !email.includes("@")) {
    throw new Error(`${bootstrapUserVariables.email} debe ser un correo válido.`);
  }

  if (password.length < 8) {
    throw new Error(`${bootstrapUserVariables.password} debe tener al menos 8 caracteres.`);
  }

  return { username, email, password };
}

function assertExpectedMigrationRange(migrationInventory) {
  const latestMigration = migrationInventory.at(-1);

  if (latestMigration?.versionNumber !== expectedLatestMigrationVersion) {
    throw new Error(
      `El bootstrap espera migraciones 001-${String(expectedLatestMigrationVersion).padStart(3, "0")}.`
    );
  }
}

async function assertDatabaseIsEmpty(client) {
  const historyResult = await client.query(
    "SELECT to_regclass('public.schema_migrations') IS NOT NULL AS exists"
  );

  if (historyResult.rows[0].exists) {
    throw new Error("La base ya contiene historial de migraciones.");
  }

  const objectsResult = await client.query(`
    SELECT count(*)::integer AS object_count
    FROM (
      SELECT class.oid
      FROM pg_catalog.pg_class AS class
      JOIN pg_catalog.pg_namespace AS namespace
        ON namespace.oid = class.relnamespace
      WHERE namespace.nspname = 'public'
        AND class.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')

      UNION ALL

      SELECT procedure.oid
      FROM pg_catalog.pg_proc AS procedure
      JOIN pg_catalog.pg_namespace AS namespace
        ON namespace.oid = procedure.pronamespace
      WHERE namespace.nspname = 'public'
    ) AS public_objects
  `);

  if (objectsResult.rows[0].object_count !== 0) {
    throw new Error("La base no está vacía; no se puede inicializar de forma segura.");
  }
}

async function readProjectSql(relativePath) {
  return readFile(path.join(projectRoot, relativePath), "utf8");
}

async function createMigrationHistoryTableInsideTransaction(client) {
  await client.query("SELECT pg_advisory_xact_lock($1::bigint)", [migrationHistoryLockKey]);
  await client.query(`
    CREATE TABLE public.schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      checksum CHAR(64) NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
      applied_by TEXT NOT NULL DEFAULT current_user,
      CONSTRAINT schema_migrations_version_positive_check CHECK (version > 0),
      CONSTRAINT schema_migrations_name_not_empty_check CHECK (btrim(name) <> ''),
      CONSTRAINT schema_migrations_checksum_format_check
        CHECK (checksum ~ '^[0-9a-f]{64}$')
    )
  `);
}

async function insertMigrationHistory(client, migrationInventory) {
  const values = [];
  const placeholders = migrationInventory.map((migration, index) => {
    const base = index * 3;

    values.push(migration.versionNumber, migration.name, migration.up.checksum);

    return `($${base + 1}, $${base + 2}, $${base + 3})`;
  });

  await client.query(
    `
      INSERT INTO public.schema_migrations (version, name, checksum)
      VALUES ${placeholders.join(", ")}
    `,
    values
  );
}

async function insertInitialSuperAdmin(client, bootstrapUser) {
  const passwordHash = await bcrypt.hash(bootstrapUser.password, 12);

  await client.query(
    `
      INSERT INTO public.users (username, email, password_hash, role)
      VALUES ($1, $2, $3, 'admin')
    `,
    [bootstrapUser.username, bootstrapUser.email, passwordHash]
  );
}

async function applyBootstrapSchema(client, migrationInventory, bootstrapUser) {
  await client.query("BEGIN");

  try {
    await client.query("SELECT pg_advisory_xact_lock($1::bigint)", [migrationHistoryLockKey]);
    await client.query("SET LOCAL search_path = public, pg_temp");
    await client.query(await readProjectSql("db/auth-schema.sql"));
    await client.query(await readProjectSql("db/schema.sql"));
    await insertInitialSuperAdmin(client, bootstrapUser);

    for (const migration of migrationInventory) {
      const sql = await readFile(migration.up.absolutePath, "utf8");
      const body = extractMigrationBody(sql);

      await client.query(body);
    }

    await createMigrationHistoryTableInsideTransaction(client);
    await insertMigrationHistory(client, migrationInventory);
    await client.query("COMMIT");
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Se conserva el error original de bootstrap.
    }

    throw error;
  }
}

async function main() {
  const connectionString = getDatabaseUrl();
  const databaseName = getDatabaseName(connectionString);
  const bootstrapUser = normalizeBootstrapUser();
  const migrationInventory = await getMigrationInventory();

  assertExpectedMigrationRange(migrationInventory);
  requireExactDatabaseConfirmation(databaseName);

  const client = new Client({ connectionString });

  try {
    await client.connect();
    await assertDatabaseIsEmpty(client);
    await applyBootstrapSchema(client, migrationInventory, bootstrapUser);

    console.log(`Base inicializada correctamente: ${databaseName}`);
    console.log(
      `Migraciones registradas: 001-${String(migrationInventory.at(-1).versionNumber).padStart(3, "0")}`
    );
    console.log("Superadministrador inicial creado.");
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);

  console.error(`No se pudo inicializar la base: ${sanitizeErrorMessage(message)}`);
  process.exitCode = 1;
});
