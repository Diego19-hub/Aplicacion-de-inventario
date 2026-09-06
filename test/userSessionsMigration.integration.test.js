import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import pg from "pg";

import {
  createTestDatabase,
  dropTestDatabase
} from "./helpers/testDatabase.js";

const { Client } = pg;
const hasTestDatabaseUrl = Boolean(process.env.TEST_DATABASE_URL);

async function migrationSql(direction) {
  return readFile(`db/migrations/032_user_sessions_${direction}.sql`, "utf8");
}

async function createClient() {
  const client = new Client({ connectionString: process.env.TEST_DATABASE_URL });
  await client.connect();
  return client;
}

test(
  "032 crea user_sessions cuando la tabla no existe y el down la conserva",
  { skip: !hasTestDatabaseUrl },
  async () => {
    let client;

    try {
      await createTestDatabase({ throughVersion: 31 });
      client = await createClient();
      await client.query(await migrationSql("up"));

      const columns = await client.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'user_sessions'
        ORDER BY ordinal_position
      `);
      assert.deepEqual(
        columns.rows.map((row) => [row.column_name, row.data_type, row.is_nullable]),
        [
          ["sid", "character varying", "NO"],
          ["sess", "json", "NO"],
          ["expire", "timestamp without time zone", "NO"]
        ]
      );
      assert.equal(
        (await client.query("SELECT conname FROM pg_constraint WHERE conrelid = 'public.user_sessions'::regclass AND contype = 'p'")).rows[0].conname,
        "user_sessions_pkey"
      );
      assert.equal(
        (await client.query("SELECT to_regclass('public.user_sessions_expire_index') AS relation")).rows[0].relation,
        "user_sessions_expire_index"
      );

      await client.query(await migrationSql("down"));
      assert.equal(
        (await client.query("SELECT to_regclass('public.user_sessions') AS relation")).rows[0].relation,
        "user_sessions"
      );
    } finally {
      if (client) await client.end();
      await dropTestDatabase();
    }
  }
);

test(
  "032 completa una user_sessions existente y conserva sus sesiones",
  { skip: !hasTestDatabaseUrl },
  async () => {
    let client;

    try {
      await createTestDatabase({ throughVersion: 31 });
      client = await createClient();
      await client.query(`
        CREATE TABLE public.user_sessions (
          sid VARCHAR NOT NULL PRIMARY KEY,
          sess JSON NOT NULL,
          expire TIMESTAMP(6) NOT NULL
        )
      `);
      await client.query(
        "INSERT INTO public.user_sessions (sid, sess, expire) VALUES ($1, $2, CURRENT_TIMESTAMP + INTERVAL '1 hour')",
        ["session-preserved", JSON.stringify({ user: 7 })]
      );

      await client.query(await migrationSql("up"));
      assert.equal(
        (await client.query("SELECT count(*)::int AS count FROM public.user_sessions WHERE sid = 'session-preserved'")).rows[0].count,
        1
      );
      assert.equal(
        (await client.query("SELECT to_regclass('public.user_sessions_expire_index') AS relation")).rows[0].relation,
        "user_sessions_expire_index"
      );
    } finally {
      if (client) await client.end();
      await dropTestDatabase();
    }
  }
);

test(
  "032 rechaza estructura incompatible y revierte sus cambios",
  { skip: !hasTestDatabaseUrl },
  async () => {
    let client;

    try {
      await createTestDatabase({ throughVersion: 31 });
      client = await createClient();
      await client.query(`
        CREATE TABLE public.user_sessions (
          sid INTEGER PRIMARY KEY,
          sess JSON NOT NULL,
          expire TIMESTAMP(6) NOT NULL
        )
      `);

      await assert.rejects(
        client.query(await migrationSql("up")),
        /user_sessions\.sid tiene un tipo incompatible/
      );
      await client.query("ROLLBACK");
      assert.equal(
        (await client.query("SELECT pg_catalog.format_type(a.atttypid, a.atttypmod) AS type FROM pg_attribute a WHERE a.attrelid = 'public.user_sessions'::regclass AND a.attname = 'sid'")).rows[0].type,
        "integer"
      );
      assert.equal(
        (await client.query("SELECT to_regclass('public.user_sessions_expire_index') AS relation")).rows[0].relation,
        null
      );
    } finally {
      if (client) await client.end();
      await dropTestDatabase();
    }
  }
);
