import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { baselineMigrationHistory } from "../db/migrationBaseline.js";
import { getMigrationInventory } from "../db/migrationFiles.js";
import { getMigrationStatus } from "../db/migrationHistory.js";
import {
  createTestDatabase,
  dropTestDatabase
} from "./helpers/testDatabase.js";

const { Client } = pg;
const hasTestDatabaseUrl = Boolean(process.env.TEST_DATABASE_URL);

test(
  "el baseline registra solamente el esquema final endurecido",
  { skip: !hasTestDatabaseUrl },
  async (t) => {
    const inventory = await getMigrationInventory();
    let client;

    async function recreateDatabase() {
      if (client) {
        await client.end();
        client = null;
      }

      await createTestDatabase({ throughVersion: 10 });
      client = new Client({ connectionString: process.env.TEST_DATABASE_URL });
      await client.connect();
    }

    async function historyCount() {
      const result = await client.query(
        "SELECT count(*)::int AS count FROM public.schema_migrations"
      );

      return result.rows[0].count;
    }

    try {
      await recreateDatabase();

      await t.test("registra únicamente 001–010 y deja 011 pendiente", async () => {
        await baselineMigrationHistory(client, inventory);
        assert.equal(await historyCount(), 10);

        const rows = await client.query(
          "SELECT version, name, checksum FROM public.schema_migrations ORDER BY version"
        );
        assert.deepEqual(
          rows.rows.map((row) => row.version),
          [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
        );
        assert.deepEqual(
          rows.rows.map((row) => row.name),
          inventory.slice(0, 10).map((migration) => migration.name)
        );
        assert.deepEqual(
          rows.rows.map((row) => row.checksum),
          inventory.slice(0, 10).map((migration) => migration.up.checksum)
        );

        const status = await getMigrationStatus(client, inventory);
        assert.equal(status.summary.applied, 10);
        assert.equal(status.summary.pending, 1);
        assert.equal(status.summary.checksum_mismatch, 0);
        assert.equal(status.summary.name_mismatch, 0);
        assert.equal(status.summary.missing_file, 0);
        assert.equal(
          status.migrations.find((migration) => migration.version === 11)?.status,
          "pending"
        );
      });

      await t.test("rechaza un segundo baseline sin modificar el historial", async () => {
        await assert.rejects(
          baselineMigrationHistory(client, inventory),
          /schema_migrations ya contiene registros/
        );
        assert.equal(await historyCount(), 10);
      });

      await t.test("rechaza RLS ausente y conserva el historial vacío", async () => {
        await recreateDatabase();
        await client.query("ALTER TABLE public.items DISABLE ROW LEVEL SECURITY");

        await assert.rejects(
          baselineMigrationHistory(client, inventory),
          /RLS no está habilitado sin FORCE/
        );
        assert.equal(await historyCount(), 0);
      });

      await t.test("rechaza un trigger inmutable ausente y conserva el historial vacío", async () => {
        await recreateDatabase();
        await client.query("DROP TRIGGER inventory_movements_immutable_trigger ON public.inventory_movements");

        await assert.rejects(
          baselineMigrationHistory(client, inventory),
          /faltan triggers de inmutabilidad/
        );
        assert.equal(await historyCount(), 0);
      });

      await t.test("rechaza un prefijo 001–010 incompleto", async () => {
        await recreateDatabase();
        const incompleteInventory = inventory.filter((migration) => migration.versionNumber !== 5);

        await assert.rejects(
          baselineMigrationHistory(client, incompleteInventory),
          /inventario continuo de migraciones 001–010/
        );
        assert.equal(
          (await client.query("SELECT to_regclass('public.schema_migrations') AS relation")).rows[0].relation,
          null
        );
      });
    } finally {
      if (client) await client.end();
      await dropTestDatabase();
    }
  }
);
