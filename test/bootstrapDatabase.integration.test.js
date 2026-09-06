import assert from "node:assert/strict";
import bcrypt from "bcrypt";
import { execFile } from "node:child_process";
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

test(
  "el bootstrap de una base vacía registra migraciones 001–032 y convierte al administrador legado",
  { skip: !hasTestDatabaseUrl },
  async () => {
    let client;
    const databaseName = new URL(process.env.TEST_DATABASE_URL).pathname.slice(1);
    const password = "bootstrap-integration-password";

    try {
      await createTestDatabase({ throughVersion: 0 });
      const result = await execFileAsync(process.execPath, ["scripts/bootstrapDatabase.js"], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          DATABASE_URL: process.env.TEST_DATABASE_URL,
          POSTGRES_URL: "",
          DATABASE_BOOTSTRAP_CONFIRM: databaseName,
          BOOTSTRAP_SUPER_ADMIN_USERNAME: "bootstrap_admin",
          BOOTSTRAP_SUPER_ADMIN_EMAIL: "bootstrap-admin@example.test",
          BOOTSTRAP_SUPER_ADMIN_PASSWORD: password
        }
      });

      assert.match(result.stdout, /Migraciones registradas: 001-032/);
      client = new Client({ connectionString: process.env.TEST_DATABASE_URL });
      await client.connect();

      assert.equal(
        (await client.query("SELECT count(*)::int AS count FROM public.schema_migrations")).rows[0].count,
        32
      );
      const user = await client.query(
        "SELECT platform_role, password_hash FROM public.users WHERE username = $1",
        ["bootstrap_admin"]
      );
      assert.equal(user.rows[0].platform_role, "super_admin");
      assert.equal(await bcrypt.compare(password, user.rows[0].password_hash), true);
    } finally {
      if (client) await client.end();
      await dropTestDatabase();
    }
  }
);
