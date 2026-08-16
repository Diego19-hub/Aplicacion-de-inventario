import assert from "node:assert/strict";
import { copyFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import pg from "pg";
import { baselineMigrationHistory } from "../db/migrationBaseline.js";
import {
  defaultMigrationsDirectory,
  getMigrationInventory
} from "../db/migrationFiles.js";
import { applyPendingMigrations, extractMigrationBody } from "../db/migrationRunner.js";
import {
  createTestDatabase,
  dropTestDatabase
} from "./helpers/testDatabase.js";

const { Client } = pg;
const hasTestDatabaseUrl = Boolean(process.env.TEST_DATABASE_URL);

test("extractMigrationBody extrae solo el cuerpo de una envoltura transaccional", () => {
  assert.equal(
    extractMigrationBody("-- comentario\nBEGIN;\nSELECT 1;\nCOMMIT;\n/* final */\n"),
    "\nSELECT 1;\n"
  );
  assert.throws(() => extractMigrationBody("SELECT 1;\nCOMMIT;"), /BEGIN/);
  assert.throws(() => extractMigrationBody("BEGIN;\nSELECT 1;"), /COMMIT/);
  assert.throws(() => extractMigrationBody("BEGIN SELECT 1; COMMIT;"), /BEGIN/);
});

test(
  "el runner aplica pendientes de forma atómica y rechaza historial incompatible",
  { skip: !hasTestDatabaseUrl },
  async () => {
    let client;
    let temporaryDirectory;

    try {
      await createTestDatabase({ throughVersion: 10 });
      client = new Client({ connectionString: process.env.TEST_DATABASE_URL });
      await client.connect();

      const baselineInventory = await getMigrationInventory();
      await baselineMigrationHistory(client, baselineInventory);

      temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "inventory-migrations-"));
      for (const migration of baselineInventory) {
        await copyFile(
          migration.up.absolutePath,
          path.join(temporaryDirectory, migration.up.fileName)
        );
        await copyFile(
          migration.down.absolutePath,
          path.join(temporaryDirectory, migration.down.fileName)
        );
      }

      await writeFile(
        path.join(temporaryDirectory, "014_runner_success_up.sql"),
        `-- comentario previo\nBEGIN;\nCREATE TABLE public.runner_success_probe (id integer PRIMARY KEY);\nINSERT INTO public.runner_success_probe (id) VALUES (1);\nCOMMIT;\n`
      );
      await writeFile(
        path.join(temporaryDirectory, "014_runner_success_down.sql"),
        "BEGIN;\nDROP TABLE public.runner_success_probe;\nCOMMIT;\n"
      );
      await writeFile(
        path.join(temporaryDirectory, "015_runner_failure_up.sql"),
        "BEGIN;\nCREATE TABLE public.runner_failure_probe (id integer PRIMARY KEY);\nINSERT INTO public.runner_success_probe (id) VALUES (2);\nSELECT missing_runner_function();\nCOMMIT;\n"
      );
      await writeFile(
        path.join(temporaryDirectory, "015_runner_failure_down.sql"),
        "BEGIN;\nDROP TABLE public.runner_failure_probe;\nCOMMIT;\n"
      );

      const inventoryThrough014 = await getMigrationInventory(temporaryDirectory);
      const inventoryThrough015 = await getMigrationInventory(temporaryDirectory);

      await applyPendingMigrations(client, inventoryThrough014.filter((migration) => migration.versionNumber <= 14));
      const registeredReal011 = await client.query(
        "SELECT checksum FROM public.schema_migrations WHERE version = $1",
        [11]
      );
      assert.equal(registeredReal011.rows[0].checksum, inventoryThrough014[10].up.checksum);
      assert.equal(
        (await client.query("SELECT count(*)::int AS count FROM public.runner_success_probe")).rows[0].count,
        1
      );
      const registeredSuccess = await client.query(
        "SELECT checksum FROM public.schema_migrations WHERE version = $1",
        [14]
      );
      assert.equal(registeredSuccess.rows[0].checksum, inventoryThrough014[13].up.checksum);

      await applyPendingMigrations(client, inventoryThrough014.filter((migration) => migration.versionNumber <= 14));
      assert.equal(
        (await client.query("SELECT count(*)::int AS count FROM public.runner_success_probe")).rows[0].count,
        1
      );
      assert.equal(
        (await client.query("SELECT count(*)::int AS count FROM public.schema_migrations WHERE version = $1", [14])).rows[0].count,
        1
      );

      await assert.rejects(
        applyPendingMigrations(client, inventoryThrough015),
        /missing_runner_function/
      );
      assert.equal(
        (await client.query("SELECT to_regclass('public.runner_failure_probe') AS relation")).rows[0].relation,
        null
      );
      assert.equal(
        (await client.query("SELECT count(*)::int AS count FROM public.runner_success_probe")).rows[0].count,
        1
      );
      assert.equal(
        (await client.query("SELECT count(*)::int AS count FROM public.schema_migrations WHERE version = $1", [15])).rows[0].count,
        0
      );

      await client.query(
        "UPDATE public.schema_migrations SET checksum = $1 WHERE version = $2",
        ["f".repeat(64), 14]
      );
      await assert.rejects(
        applyPendingMigrations(client, inventoryThrough015),
        /historial incompatible/
      );
      assert.equal(
        (await client.query("SELECT to_regclass('public.runner_failure_probe') AS relation")).rows[0].relation,
        null
      );
    } finally {
      if (client) await client.end();
      if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true });
      await dropTestDatabase();
    }
  }
);
