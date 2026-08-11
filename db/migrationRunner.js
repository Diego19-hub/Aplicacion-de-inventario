import { readFile } from "node:fs/promises";
import {
  getMigrationStatus,
  migrationHistoryExists
} from "./migrationHistory.js";

// Debe coincidir con el bloqueo usado por el historial y el baseline.
const migrationHistoryLockKey = 781042261;
const baselineVersions = Array.from({ length: 10 }, (_, index) => index + 1);
const leadingTriviaPattern = /^(?:(?:\s+)|(?:--[^\n]*(?:\n|$))|(?:\/\*[\s\S]*?\*\/))*/;
const trailingTriviaPattern = /(?:(?:\s+)|(?:--[^\n]*(?:\n|$))|(?:\/\*[\s\S]*?\*\/))*$/;

export function extractMigrationBody(sql) {
  if (typeof sql !== "string") {
    throw new TypeError("La migración debe ser texto SQL.");
  }

  const leadingMatch = sql.match(leadingTriviaPattern);
  const leadingLength = leadingMatch?.[0].length ?? 0;
  const afterLeadingTrivia = sql.slice(leadingLength);
  const beginMatch = afterLeadingTrivia.match(/^BEGIN\s*;/i);

  if (!beginMatch) {
    throw new Error("La migración debe iniciar con un BEGIN; exterior.");
  }

  const afterBegin = afterLeadingTrivia.slice(beginMatch[0].length);
  const trailingMatch = afterBegin.match(trailingTriviaPattern);
  const trailingLength = trailingMatch?.[0].length ?? 0;
  const withoutTrailingTrivia = trailingLength === 0
    ? afterBegin
    : afterBegin.slice(0, -trailingLength);
  const commitMatch = withoutTrailingTrivia.match(/^(.*)\bCOMMIT\s*;$/is);

  if (!commitMatch) {
    throw new Error("La migración debe terminar con un COMMIT; exterior.");
  }

  return commitMatch[1];
}

function assertValidBaseline(status, migrationInventory) {
  if (status.state !== "initialized") {
    throw new Error("No se pueden aplicar migraciones sin un baseline válido.");
  }

  const byVersion = new Map(status.migrations.map((migration) => [migration.version, migration]));

  for (const version of baselineVersions) {
    if (byVersion.get(version)?.status !== "applied") {
      throw new Error("No se pueden aplicar migraciones sin un baseline válido.");
    }
  }

  const expectedBaseline = migrationInventory.filter(
    (migration) => migration.versionNumber <= baselineVersions.at(-1)
  );

  if (expectedBaseline.length !== baselineVersions.length) {
    throw new Error("No se pueden aplicar migraciones sin un baseline válido.");
  }
}

function assertCompatibleStatus(status) {
  if (
    status.summary.checksum_mismatch > 0
    || status.summary.name_mismatch > 0
    || status.summary.missing_file > 0
  ) {
    throw new Error("No se pueden aplicar migraciones con historial incompatible.");
  }

  const appliedVersions = status.migrations
    .filter((migration) => migration.status === "applied")
    .map((migration) => migration.version);
  const highestApplied = Math.max(...appliedVersions);
  const pendingBeforeHighestApplied = status.migrations.some(
    (migration) => migration.status === "pending" && migration.version < highestApplied
  );

  if (pendingBeforeHighestApplied) {
    throw new Error("No se pueden aplicar migraciones: existe un hueco en el historial.");
  }

  return highestApplied;
}

async function getRunnablePendingMigrations(client, migrationInventory) {
  const status = await getMigrationStatus(client, migrationInventory);

  assertValidBaseline(status, migrationInventory);
  const highestApplied = assertCompatibleStatus(status);

  return status.migrations
    .filter(
      (migration) => migration.status === "pending" && migration.version > highestApplied
    )
    .sort((first, second) => first.version - second.version);
}

export async function applyPendingMigrations(client, migrationInventory) {
  if (!await migrationHistoryExists(client)) {
    throw new Error("No se pueden aplicar migraciones sin un baseline válido.");
  }

  await getRunnablePendingMigrations(client, migrationInventory);

  while (true) {
    await client.query("BEGIN");

    try {
      await client.query("SELECT pg_advisory_xact_lock($1::bigint)", [migrationHistoryLockKey]);
      const pendingMigrations = await getRunnablePendingMigrations(client, migrationInventory);
      const migration = pendingMigrations[0];

      if (!migration) {
        await client.query("COMMIT");
        return;
      }

      const inventoryMigration = migrationInventory.find(
        (candidate) => candidate.versionNumber === migration.version
      );
      const sql = await readFile(inventoryMigration.up.absolutePath, "utf8");
      const body = extractMigrationBody(sql);

      await client.query(body);
      await client.query(
        `
          INSERT INTO public.schema_migrations (version, name, checksum)
          VALUES ($1, $2, $3)
        `,
        [
          inventoryMigration.versionNumber,
          inventoryMigration.name,
          inventoryMigration.up.checksum
        ]
      );
      await client.query("COMMIT");
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // Se conserva el error original de la migración.
      }

      throw error;
    }
  }
}
