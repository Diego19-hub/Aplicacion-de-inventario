import "dotenv/config";
import pg from "pg";
import { baselineMigrationHistory } from "../db/migrationBaseline.js";
import { getMigrationInventory } from "../db/migrationFiles.js";
import { getMigrationStatus } from "../db/migrationHistory.js";

const { Client } = pg;
const allowedCommands = new Set(["status", "baseline"]);
const statusNames = [
  "applied",
  "pending",
  "checksum_mismatch",
  "name_mismatch",
  "missing_file"
];

class CliError extends Error {}

function getDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;

  if (!databaseUrl) {
    throw new CliError("Falta DATABASE_URL o POSTGRES_URL.");
  }

  return databaseUrl;
}

function getDatabaseName(databaseUrl) {
  let url;

  try {
    url = new URL(databaseUrl);
  } catch {
    throw new CliError("La URL de PostgreSQL no es válida.");
  }

  const pathname = decodeURIComponent(url.pathname);
  const databaseName = pathname.startsWith("/") ? pathname.slice(1) : "";

  if (!databaseName || databaseName.includes("/")) {
    throw new CliError("La URL de PostgreSQL debe incluir un nombre de base válido.");
  }

  return databaseName;
}

function formatVersions(migrations) {
  return migrations.length === 0
    ? "ninguna"
    : migrations.map((migration) => String(migration.version).padStart(3, "0")).join(", ");
}

function printStatus(databaseName, status) {
  console.log(`Base: ${databaseName}`);
  console.log(`Estado: ${status.state}`);

  for (const statusName of statusNames) {
    const migrations = status.migrations.filter((migration) => migration.status === statusName);
    console.log(`${statusName}: ${formatVersions(migrations)}`);
  }
}

async function run() {
  const command = process.argv[2];

  if (!allowedCommands.has(command) || process.argv.length !== 3) {
    throw new CliError("Uso: node scripts/migrations.js <status|baseline>.");
  }

  const databaseUrl = getDatabaseUrl();
  const databaseName = getDatabaseName(databaseUrl);

  if (command === "baseline" && process.env.MIGRATION_BASELINE_CONFIRM !== databaseName) {
    throw new CliError("MIGRATION_BASELINE_CONFIRM debe coincidir exactamente con el nombre de la base.");
  }

  const inventory = await getMigrationInventory();
  const client = new Client({ connectionString: databaseUrl });

  try {
    await client.connect();

    if (command === "status") {
      const status = await getMigrationStatus(client, inventory);
      printStatus(databaseName, status);

      if (status.summary.checksum_mismatch > 0 || status.summary.missing_file > 0) {
        process.exitCode = 1;
      }

      return;
    }

    await baselineMigrationHistory(client, inventory);
    console.log(`Base: ${databaseName}`);
    console.log(`Estado: baseline aplicado`);
    console.log(`Versiones registradas: ${inventory.map((migration) => migration.version).join(", ")}`);
  } finally {
    await client.end();
  }
}

run().catch((error) => {
  if (error instanceof CliError) {
    console.error(error.message);
  } else {
    console.error("No se pudo completar la operación de migraciones.");
  }

  process.exitCode = 1;
});
