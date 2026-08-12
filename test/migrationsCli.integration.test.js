import { execFile } from "node:child_process";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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
const movementIndexes = [
  "inventory_movements_business_user_history_index",
  "inventory_movements_business_type_history_index"
];

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

    async function movementIndexDefinitions() {
      const result = await client.query(
        `
          SELECT indexname, indexdef
          FROM pg_indexes
          WHERE schemaname = 'public'
            AND tablename = 'inventory_movements'
          ORDER BY indexname
        `
      );

      return result.rows;
    }

    async function recreateDatabase() {
      if (client) {
        await client.end();
        client = null;
      }

      await dropTestDatabase();
      await createTestDatabase({ throughVersion: 10 });
      client = new Client({ connectionString: process.env.TEST_DATABASE_URL });
      await client.connect();
    }

    try {
      await createTestDatabase({ throughVersion: 10 });
      client = new Client({ connectionString: process.env.TEST_DATABASE_URL });
      await client.connect();

      const initialStatus = await runCli(["status"]);
      assert.equal(initialStatus.code, 0);
      assert.match(initialStatus.stdout, /Base: inventory_boxing_integration_test/);
      assert.match(initialStatus.stdout, /Estado: uninitialized/);
      assert.match(initialStatus.stdout, /pending: 001, 002, 003, 004, 005, 006, 007, 008, 009, 010, 011/);
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

      const statusBeforeUp = await runCli(["status"]);
      assert.equal(statusBeforeUp.code, 0);
      assert.match(statusBeforeUp.stdout, /applied: 001, 002, 003, 004, 005, 006, 007, 008, 009, 010/);
      assert.match(statusBeforeUp.stdout, /pending: 011/);

      const upWithPending = await runCli(["up"], {
        MIGRATION_UP_CONFIRM: "inventory_boxing_integration_test"
      });
      assert.equal(upWithPending.code, 0);
      assert.match(upWithPending.stdout, /Versiones aplicadas: 011/);
      assert.equal(
        (await client.query("SELECT count(*)::int AS count FROM public.schema_migrations")).rows[0].count,
        11
      );
      const registeredEleven = await client.query(
        "SELECT checksum FROM public.schema_migrations WHERE version = $1",
        [11]
      );
      assert.match(registeredEleven.rows[0].checksum, /^[a-f0-9]{64}$/);

      const indexDefinitions = await movementIndexDefinitions();
      assert.match(
        indexDefinitions.find((index) => index.indexname === movementIndexes[0]).indexdef,
        /\(business_id, created_by, created_at DESC, id DESC\)/
      );
      assert.match(
        indexDefinitions.find((index) => index.indexname === movementIndexes[1]).indexdef,
        /\(business_id, movement_type, created_at DESC, id DESC\)/
      );

      const category = await client.query(
        "INSERT INTO public.categories (business_id, name, description) VALUES (1, $1, '') RETURNING id",
        ["Categoría de planes"]
      );
      const item = await client.query(
        "INSERT INTO public.items (business_id, category_id, sku, name, description, brand, price, stock) VALUES (1, $1, $2, $3, '', 'Fixture', 1, 0) RETURNING id",
        [category.rows[0].id, "PLAN-011", "Producto de planes"]
      );
      const analyst = await client.query(
        "INSERT INTO public.users (username, email, password_hash, platform_role) VALUES ($1, $2, $3, 'user') RETURNING id",
        ["analista_planes", "analista-planes@example.test", "no-utilizable"]
      );
      await client.query(
        "INSERT INTO public.business_members (business_id, user_id, role, status) VALUES (1, $1, 'manager', 'active')",
        [analyst.rows[0].id]
      );
      const location = await client.query(
        "SELECT id FROM public.business_locations WHERE business_id = 1 ORDER BY id LIMIT 1"
      );
      await client.query(
        `
          INSERT INTO public.inventory_movements (
            business_id, location_id, item_id, movement_type, quantity_delta,
            previous_stock, resulting_stock, reason, created_by, created_at
          )
          SELECT
            1,
            $1,
            $2,
            CASE WHEN series <= 100 THEN 'adjustment' ELSE 'entry' END,
            1,
            0,
            1,
            'Movimiento selectivo de prueba',
            CASE WHEN series <= 200 THEN $3 ELSE 1 END,
            clock_timestamp() - (series % 30) * interval '1 day'
          FROM generate_series(1, 5000) AS series
        `,
        [location.rows[0].id, item.rows[0].id, analyst.rows[0].id]
      );
      await client.query("ANALYZE public.inventory_movements");

      async function explain(query) {
        const result = await client.query(`EXPLAIN (ANALYZE, BUFFERS) ${query}`);

        return result.rows.map((row) => row["QUERY PLAN"]).join("\n");
      }

      const userPlan = await explain(
        `SELECT id FROM public.inventory_movements
         WHERE business_id = 1 AND created_by = ${analyst.rows[0].id}
         ORDER BY created_at DESC, id DESC LIMIT 25`
      );
      const typePlan = await explain(
        `SELECT id FROM public.inventory_movements
         WHERE business_id = 1 AND movement_type = 'adjustment'
         ORDER BY created_at DESC, id DESC LIMIT 25`
      );
      const combinedPlan = await explain(
        `SELECT id FROM public.inventory_movements
         WHERE business_id = 1 AND created_by = ${analyst.rows[0].id}
           AND movement_type = 'adjustment'
         ORDER BY created_at DESC, id DESC LIMIT 25`
      );
      const rangedPlan = await explain(
        `SELECT id FROM public.inventory_movements
         WHERE business_id = 1 AND created_by = ${analyst.rows[0].id}
           AND created_at >= current_timestamp - interval '5 days'
         ORDER BY created_at DESC, id DESC LIMIT 25`
      );
      assert.match(userPlan, new RegExp(movementIndexes[0]));
      assert.match(typePlan, new RegExp(movementIndexes[1]));
      assert.match(combinedPlan, /inventory_movements_business_(?:user|type)_history_index/);
      assert.match(rangedPlan, new RegExp(movementIndexes[0]));

      const upWithoutPending = await runCli(["up"], {
        MIGRATION_UP_CONFIRM: "inventory_boxing_integration_test"
      });
      assert.equal(upWithoutPending.code, 0);
      assert.match(upWithoutPending.stdout, /No hay migraciones pendientes/);
      assert.equal(
        (await client.query("SELECT count(*)::int AS count FROM public.schema_migrations")).rows[0].count,
        11
      );

      const finalStatus = await runCli(["status"]);
      assert.equal(finalStatus.code, 0);
      assert.match(finalStatus.stdout, /applied: 001, 002, 003, 004, 005, 006, 007, 008, 009, 010, 011/);
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
        11
      );

      await recreateDatabase();
      const indexesBefore = (await movementIndexDefinitions()).map((index) => index.indexname);
      const upSql = await readFile(
        new URL("../db/migrations/011_movement_report_indexes_up.sql", import.meta.url),
        "utf8"
      );
      const downSql = await readFile(
        new URL("../db/migrations/011_movement_report_indexes_down.sql", import.meta.url),
        "utf8"
      );

      await client.query(upSql);
      assert.deepEqual(
        (await movementIndexDefinitions())
          .map((index) => index.indexname)
          .filter((indexName) => !indexesBefore.includes(indexName))
          .sort(),
        [...movementIndexes].sort()
      );
      await client.query(downSql);
      assert.deepEqual(
        (await movementIndexDefinitions()).map((index) => index.indexname),
        indexesBefore
      );
      await client.query(upSql);
      assert.deepEqual(
        (await movementIndexDefinitions())
          .map((index) => index.indexname)
          .filter((indexName) => !indexesBefore.includes(indexName))
          .sort(),
        [...movementIndexes].sort()
      );

      for (const result of [
        initialStatus,
        missingUpConfirmation,
        incorrectUpConfirmation,
        upBeforeBaseline,
        missingConfirmation,
        incorrectConfirmation,
        baseline,
        statusBeforeUp,
        upWithPending,
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
