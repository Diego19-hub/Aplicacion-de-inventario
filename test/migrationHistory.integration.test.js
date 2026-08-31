import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { getMigrationInventory } from "../db/migrationFiles.js";
import {
  createMigrationHistoryTable,
  getMigrationStatus,
  migrationHistoryExists
} from "../db/migrationHistory.js";
import {
  createTestDatabase,
  dropTestDatabase
} from "./helpers/testDatabase.js";

const { Client } = pg;
const hasTestDatabaseUrl = Boolean(process.env.TEST_DATABASE_URL);

test(
  "el historial de migraciones compara archivos y registros",
  { skip: !hasTestDatabaseUrl },
  async (t) => {
    let client;
    let databaseCreated = false;

    try {
      await createTestDatabase();
      databaseCreated = true;
      client = new Client({ connectionString: process.env.TEST_DATABASE_URL });
      await client.connect();

      const inventory = await getMigrationInventory();
      assert.deepEqual(
        inventory.map((migration) => migration.versionNumber),
        Array.from({ length: 29 }, (_, index) => index + 1)
      );

      await t.test("inicia sin tabla y todas las migraciones están pendientes", async () => {
        assert.equal(await migrationHistoryExists(client), false);

        const status = await getMigrationStatus(client, inventory);
        assert.equal(status.state, "uninitialized");
        assert.equal(status.summary.pending, 29);
        assert.equal(status.summary.total, 29);
        assert.ok(status.migrations.every((migration) => migration.status === "pending"));
      });

      await t.test("crea la tabla con columnas, restricciones y sin registros", async () => {
        await createMigrationHistoryTable(client);
        assert.equal(await migrationHistoryExists(client), true);

        const columns = await client.query(`
          SELECT attname, format_type(atttypid, atttypmod) AS type, attnotnull,
            pg_get_expr(adbin, adrelid) AS default_value
          FROM pg_attribute
          LEFT JOIN pg_attrdef ON adrelid = attrelid AND adnum = attnum
          WHERE attrelid = 'public.schema_migrations'::regclass
            AND attnum > 0
            AND NOT attisdropped
          ORDER BY attnum
        `);
        assert.deepEqual(
          columns.rows.map((column) => column.attname),
          ["version", "name", "checksum", "applied_at", "applied_by"]
        );
        assert.deepEqual(
          columns.rows.map((column) => column.type),
          ["integer", "text", "character(64)", "timestamp with time zone", "text"]
        );
        assert.ok(columns.rows.every((column) => column.attnotnull));
        assert.match(columns.rows[3].default_value, /clock_timestamp/);
        assert.match(columns.rows[4].default_value, /CURRENT_USER/i);

        const constraints = await client.query(`
          SELECT conname
          FROM pg_constraint
          WHERE conrelid = 'public.schema_migrations'::regclass
            AND contype IN ('p', 'c')
          ORDER BY conname
        `);
        assert.deepEqual(
          constraints.rows.map((constraint) => constraint.conname),
          [
            "schema_migrations_checksum_format_check",
            "schema_migrations_name_not_empty_check",
            "schema_migrations_pkey",
            "schema_migrations_version_positive_check"
          ]
        );

        const count = await client.query("SELECT count(*)::int AS count FROM public.schema_migrations");
        assert.equal(count.rows[0].count, 0);
      });

      await t.test("clasifica historial aplicado, divergente y sin archivo", async () => {
        await client.query(
          `
            INSERT INTO public.schema_migrations (version, name, checksum)
            VALUES
              ($1, $2, $3),
              ($4, $5, $6),
              ($7, $8, $9),
              ($10, $11, $12)
          `,
          [
            inventory[0].versionNumber,
            inventory[0].name,
            inventory[0].up.checksum,
            inventory[1].versionNumber,
            inventory[1].name,
            "f".repeat(64),
            inventory[2].versionNumber,
            "nombre_incorrecto",
            inventory[2].up.checksum,
            999,
            "archivo_eliminado",
            "a".repeat(64)
          ]
        );

        const status = await getMigrationStatus(client, inventory);
        const byVersion = new Map(status.migrations.map((migration) => [migration.version, migration]));

        assert.equal(byVersion.get(1).status, "applied");
        assert.equal(byVersion.get(2).status, "checksum_mismatch");
        assert.equal(byVersion.get(3).status, "name_mismatch");
        assert.equal(byVersion.get(999).status, "missing_file");
        assert.equal(status.summary.applied, 1);
        assert.equal(status.summary.checksum_mismatch, 1);
        assert.equal(status.summary.name_mismatch, 1);
        assert.equal(status.summary.missing_file, 1);
        assert.equal(status.summary.pending, 26);
      });

      await t.test("la creación repetida conserva los registros existentes", async () => {
        await createMigrationHistoryTable(client);

        const count = await client.query("SELECT count(*)::int AS count FROM public.schema_migrations");
        assert.equal(count.rows[0].count, 4);
      });
    } finally {
      if (client) await client.end();
      if (databaseCreated) await dropTestDatabase();
    }
  }
);
