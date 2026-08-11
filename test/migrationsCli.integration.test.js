import { execFile } from "node:child_process";
import assert from "node:assert/strict";
import { promisify } from "node:util";
import test from "node:test";
import pg from "pg";
import {
  createTestDatabase,
  dropTestDatabase
} from "./helpers/testDatabase.js";

const { Client } = pg;
const execFileAsync = promisify(execFile);
const hasTestDatabaseUrl = Boolean(process.env.TEST_DATABASE_URL);

async function runCli(argumentsList, environment = {}) {
  try {
    const result = await execFileAsync(process.execPath, ["scripts/migrations.js", ...argumentsList], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DATABASE_URL: process.env.TEST_DATABASE_URL,
        POSTGRES_URL: "",
        ...environment
      }
    });

    return { code: 0, ...result };
  } catch (error) {
    return {
      code: error.code,
      stdout: error.stdout ?? "",
      stderr: error.stderr ?? ""
    };
  }
}

test(
  "el CLI de migraciones consulta y crea baseline sin revelar credenciales",
  { skip: !hasTestDatabaseUrl },
  async () => {
    let client;

    try {
      await createTestDatabase();
      client = new Client({ connectionString: process.env.TEST_DATABASE_URL });
      await client.connect();

      const initialStatus = await runCli(["status"]);
      assert.equal(initialStatus.code, 0);
      assert.match(initialStatus.stdout, /Base: inventory_boxing_integration_test/);
      assert.match(initialStatus.stdout, /Estado: uninitialized/);
      assert.match(initialStatus.stdout, /pending: 001, 002, 003, 004, 005, 006, 007, 008, 009, 010/);
      assert.equal(
        (await client.query("SELECT to_regclass('public.schema_migrations') AS relation")).rows[0].relation,
        null
      );

      const missingUpConfirmation = await runCli(["up"]);
      assert.notEqual(missingUpConfirmation.code, 0);
      assert.equal(
        (await client.query("SELECT to_regclass('public.schema_migrations') AS relation")).rows[0].relation,
        null
      );

      const incorrectUpConfirmation = await runCli(["up"], {
        MIGRATION_UP_CONFIRM: "otra_base"
      });
      assert.notEqual(incorrectUpConfirmation.code, 0);
      assert.equal(
        (await client.query("SELECT to_regclass('public.schema_migrations') AS relation")).rows[0].relation,
        null
      );

      const upBeforeBaseline = await runCli(["up"], {
        MIGRATION_UP_CONFIRM: "inventory_boxing_integration_test"
      });
      assert.notEqual(upBeforeBaseline.code, 0);
      assert.match(upBeforeBaseline.stderr, /primero se necesita baseline/);
      assert.equal(
        (await client.query("SELECT to_regclass('public.schema_migrations') AS relation")).rows[0].relation,
        null
      );

      const missingConfirmation = await runCli(["baseline"]);
      assert.notEqual(missingConfirmation.code, 0);
      assert.equal(
        (await client.query("SELECT to_regclass('public.schema_migrations') AS relation")).rows[0].relation,
        null
      );

      const incorrectConfirmation = await runCli(["baseline"], {
        MIGRATION_BASELINE_CONFIRM: "otra_base"
      });
      assert.notEqual(incorrectConfirmation.code, 0);
      assert.equal(
        (await client.query("SELECT to_regclass('public.schema_migrations') AS relation")).rows[0].relation,
        null
      );

      const baseline = await runCli(["baseline"], {
        MIGRATION_BASELINE_CONFIRM: "inventory_boxing_integration_test"
      });
      assert.equal(baseline.code, 0);
      assert.match(baseline.stdout, /Versiones registradas: 001, 002, 003, 004, 005, 006, 007, 008, 009, 010/);

      const history = await client.query(
        "SELECT version FROM public.schema_migrations ORDER BY version"
      );
      assert.deepEqual(
        history.rows.map((row) => row.version),
        [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
      );

      const upWithoutPending = await runCli(["up"], {
        MIGRATION_UP_CONFIRM: "inventory_boxing_integration_test"
      });
      assert.equal(upWithoutPending.code, 0);
      assert.match(upWithoutPending.stdout, /No hay migraciones pendientes/);
      assert.equal(
        (await client.query("SELECT count(*)::int AS count FROM public.schema_migrations")).rows[0].count,
        10
      );

      const finalStatus = await runCli(["status"]);
      assert.equal(finalStatus.code, 0);
      assert.match(finalStatus.stdout, /applied: 001, 002, 003, 004, 005, 006, 007, 008, 009, 010/);
      assert.match(finalStatus.stdout, /pending: ninguna/);
      assert.match(finalStatus.stdout, /checksum_mismatch: ninguna/);
      assert.match(finalStatus.stdout, /name_mismatch: ninguna/);
      assert.match(finalStatus.stdout, /missing_file: ninguna/);

      const repeatedBaseline = await runCli(["baseline"], {
        MIGRATION_BASELINE_CONFIRM: "inventory_boxing_integration_test"
      });
      assert.notEqual(repeatedBaseline.code, 0);
      assert.equal(
        (await client.query("SELECT count(*)::int AS count FROM public.schema_migrations")).rows[0].count,
        10
      );

      for (const result of [
        initialStatus,
        missingUpConfirmation,
        incorrectUpConfirmation,
        upBeforeBaseline,
        missingConfirmation,
        incorrectConfirmation,
        baseline,
        upWithoutPending,
        finalStatus,
        repeatedBaseline
      ]) {
        const output = `${result.stdout}${result.stderr}`;

        assert.doesNotMatch(output, new RegExp(process.env.TEST_DATABASE_URL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
        assert.doesNotMatch(output, /diegoulisesortegabarajas/);
      }
    } finally {
      if (client) await client.end();
      await dropTestDatabase();
    }
  }
);
