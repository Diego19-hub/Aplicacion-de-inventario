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
const functionReference = "public.enforce_exactly_one_active_owner()";

async function publicCanExecute(client) {
  const result = await client.query(
    `
      SELECT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_proc AS procedure
        CROSS JOIN LATERAL pg_catalog.aclexplode(
          coalesce(procedure.proacl, pg_catalog.acldefault('f', procedure.proowner))
        ) AS privilege
        WHERE procedure.oid = $1::regprocedure
          AND privilege.grantee = 0
          AND privilege.privilege_type = 'EXECUTE'
      ) AS can_execute
    `,
    [functionReference]
  );

  return result.rows[0].can_execute;
}

test(
  "013 revoca EXECUTE público sin afectar los triggers de owner",
  { skip: !hasTestDatabaseUrl },
  async () => {
    let client;

    try {
      await createTestDatabase({ throughVersion: 12 });
      client = new Client({ connectionString: process.env.TEST_DATABASE_URL });
      await client.connect();

      const upSql = await readFile(
        new URL("../db/migrations/013_revoke_owner_trigger_public_execute_up.sql", import.meta.url),
        "utf8"
      );
      const downSql = await readFile(
        new URL("../db/migrations/013_revoke_owner_trigger_public_execute_down.sql", import.meta.url),
        "utf8"
      );

      assert.equal(await publicCanExecute(client), true);
      await client.query(upSql);
      assert.equal(await publicCanExecute(client), false);
      assert.equal(
        (await client.query("SELECT has_function_privilege(current_user, $1::regprocedure, 'EXECUTE') AS can_execute", [functionReference])).rows[0].can_execute,
        true
      );

      const business = await client.query("SELECT id FROM public.businesses ORDER BY id LIMIT 1");
      const businessId = business.rows[0].id;
      const owner = await client.query(
        `
          SELECT user_id
          FROM public.business_members
          WHERE business_id = $1 AND role = 'owner' AND status = 'active'
        `,
        [businessId]
      );
      const replacement = await client.query(
        `
          INSERT INTO public.users (username, email, password_hash, platform_role)
          VALUES ('owner_013_replacement', 'owner-013-replacement@example.test', 'no-utilizable', 'user')
          RETURNING id
        `
      );
      await client.query(
        `
          INSERT INTO public.business_members (business_id, user_id, role, status)
          VALUES ($1, $2, 'manager', 'active')
        `,
        [businessId, replacement.rows[0].id]
      );
      await client.query("BEGIN");
      await client.query(
        "UPDATE public.business_members SET role = 'manager' WHERE business_id = $1 AND user_id = $2",
        [businessId, owner.rows[0].user_id]
      );
      await client.query(
        "UPDATE public.business_members SET role = 'owner' WHERE business_id = $1 AND user_id = $2",
        [businessId, replacement.rows[0].id]
      );
      await client.query("COMMIT");
      assert.equal(
        (await client.query(
          `
            SELECT count(*)::int AS count
            FROM public.business_members
            WHERE business_id = $1 AND role = 'owner' AND status = 'active'
          `,
          [businessId]
        )).rows[0].count,
        1
      );

      await client.query(downSql);
      assert.equal(await publicCanExecute(client), false);
      await client.query(upSql);
      assert.equal(await publicCanExecute(client), false);
    } finally {
      if (client) await client.end();
      await dropTestDatabase();
    }
  }
);
