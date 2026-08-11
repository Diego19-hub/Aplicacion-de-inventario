const migrationHistoryLockKey = 781042261;

function buildSummary(migrations) {
  const summary = {
    applied: 0,
    pending: 0,
    checksum_mismatch: 0,
    name_mismatch: 0,
    missing_file: 0
  };

  for (const migration of migrations) {
    summary[migration.status] += 1;
  }

  return {
    ...summary,
    total: migrations.length
  };
}

export async function migrationHistoryExists(client) {
  const result = await client.query(
    "SELECT to_regclass('public.schema_migrations') IS NOT NULL AS exists"
  );

  return result.rows[0].exists;
}

export async function createMigrationHistoryTable(client) {
  await client.query("BEGIN");

  try {
    // Serializa la inicialización del historial entre procesos de migración.
    await client.query("SELECT pg_advisory_xact_lock($1::bigint)", [migrationHistoryLockKey]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.schema_migrations (
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
    await client.query("COMMIT");
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Se conserva el error original de inicialización.
    }

    throw error;
  }
}

export async function getMigrationStatus(client, migrationInventory) {
  const initialized = await migrationHistoryExists(client);
  const pendingMigrations = migrationInventory.map((migration) => ({
    version: migration.versionNumber,
    name: migration.name,
    checksum: migration.up.checksum,
    status: "pending"
  }));

  if (!initialized) {
    return {
      state: "uninitialized",
      migrations: pendingMigrations,
      summary: buildSummary(pendingMigrations)
    };
  }

  const result = await client.query(
    `
      SELECT version, name, checksum, applied_at, applied_by
      FROM public.schema_migrations
      ORDER BY version
    `
  );
  const historyByVersion = new Map(
    result.rows.map((migration) => [migration.version, migration])
  );
  const migrations = migrationInventory.map((migration) => {
    const history = historyByVersion.get(migration.versionNumber);

    if (!history) {
      return {
        version: migration.versionNumber,
        name: migration.name,
        checksum: migration.up.checksum,
        status: "pending"
      };
    }

    historyByVersion.delete(migration.versionNumber);
    const status = history.checksum !== migration.up.checksum
      ? "checksum_mismatch"
      : history.name !== migration.name
        ? "name_mismatch"
        : "applied";

    return {
      version: migration.versionNumber,
      name: migration.name,
      checksum: migration.up.checksum,
      history,
      status
    };
  });

  for (const history of historyByVersion.values()) {
    migrations.push({
      version: history.version,
      name: history.name,
      checksum: history.checksum,
      history,
      status: "missing_file"
    });
  }

  return {
    state: "initialized",
    migrations,
    summary: buildSummary(migrations)
  };
}
