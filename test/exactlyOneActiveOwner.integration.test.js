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
const migrationUrl = new URL(
  "../db/migrations/012_exactly_one_active_owner_up.sql",
  import.meta.url
);
const rollbackUrl = new URL(
  "../db/migrations/012_exactly_one_active_owner_down.sql",
  import.meta.url
);

async function createUser(client, suffix) {
  const result = await client.query(
    `
      INSERT INTO public.users (username, email, password_hash, platform_role)
      VALUES ($1, $2, 'no-utilizable', 'user')
      RETURNING id
    `,
    [`o_${suffix}`, `owner-test-${suffix}@example.test`]
  );

  return result.rows[0].id;
}

async function activeOwner(client, businessId) {
  const result = await client.query(
    `
      SELECT id, user_id, role, status
      FROM public.business_members
      WHERE business_id = $1 AND role = 'owner' AND status = 'active'
    `,
    [businessId]
  );

  return result.rows;
}

test(
  "012 garantiza exactamente un owner activo de manera diferible",
  { skip: !hasTestDatabaseUrl },
  async () => {
    let client;

    try {
      const upSql = await readFile(migrationUrl, "utf8");
      const downSql = await readFile(rollbackUrl, "utf8");

      await createTestDatabase({ throughVersion: 11 });
      client = new Client({ connectionString: process.env.TEST_DATABASE_URL });
      await client.connect();

      const primaryBusiness = await client.query(
        "SELECT id FROM public.businesses ORDER BY id LIMIT 1"
      );
      const businessId = primaryBusiness.rows[0].id;
      const originalOwner = (await activeOwner(client, businessId))[0];

      await client.query(
        "UPDATE public.business_members SET role = 'manager' WHERE id = $1",
        [originalOwner.id]
      );
      // La migración aún no está aplicada: dejar el fixture inválido prueba su validación previa.
      await assert.rejects(client.query(upSql), /cada negocio actual debe tener exactamente un owner activo/);
      await client.query("ROLLBACK");
      await client.query(
        "UPDATE public.business_members SET role = 'owner' WHERE business_id = $1 AND user_id = $2",
        [businessId, originalOwner.user_id]
      );

      await client.query(upSql);
      const triggers = await client.query(
        `
          SELECT tgname, tgdeferrable, tginitdeferred
          FROM pg_catalog.pg_trigger
          WHERE tgname IN (
            'business_members_exactly_one_active_owner_trigger',
            'businesses_exactly_one_active_owner_trigger'
          )
          ORDER BY tgname
        `
      );
      assert.deepEqual(
        triggers.rows.map((row) => ({
          name: row.tgname,
          deferrable: row.tgdeferrable,
          initiallyDeferred: row.tginitdeferred
        })),
        [
          {
            name: "business_members_exactly_one_active_owner_trigger",
            deferrable: true,
            initiallyDeferred: true
          },
          {
            name: "businesses_exactly_one_active_owner_trigger",
            deferrable: true,
            initiallyDeferred: true
          }
        ]
      );
      assert.equal(
        (await client.query(
          "SELECT to_regclass('public.business_members_one_active_owner_per_business') AS relation"
        )).rows[0].relation,
        "business_members_one_active_owner_per_business"
      );

      await client.query("BEGIN");
      await client.query(
        "UPDATE public.business_members SET role = 'manager' WHERE business_id = $1 AND user_id = $2",
        [businessId, originalOwner.user_id]
      );
      await assert.rejects(client.query("COMMIT"), /exactamente un owner activo/);
      await client.query("ROLLBACK");
      assert.equal((await activeOwner(client, businessId)).length, 1);

      const replacementOwnerId = await createUser(client, "replacement");
      await client.query(
        `
          INSERT INTO public.business_members (business_id, user_id, role, status)
          VALUES ($1, $2, 'manager', 'active')
        `,
        [businessId, replacementOwnerId]
      );
      await assert.rejects(
        client.query(
          `
            INSERT INTO public.business_members (business_id, user_id, role, status)
            VALUES ($1, $2, 'owner', 'active')
          `,
          [businessId, await createUser(client, "second-owner")]
        ),
        /duplicate key value/
      );

      await client.query("BEGIN");
      await client.query(
        "UPDATE public.business_members SET role = 'manager' WHERE business_id = $1 AND user_id = $2",
        [businessId, originalOwner.user_id]
      );
      await client.query(
        "UPDATE public.business_members SET role = 'owner' WHERE business_id = $1 AND user_id = $2",
        [businessId, replacementOwnerId]
      );
      await client.query("COMMIT");
      assert.deepEqual(
        (await activeOwner(client, businessId)).map(({ user_id, role, status }) => ({
          user_id,
          role,
          status
        })),
        [{ user_id: replacementOwnerId, role: "owner", status: "active" }]
      );

      const secondBusinessOwnerId = await createUser(client, "second-business-owner");
      const movingManagerId = await createUser(client, "moving-manager");
      await client.query("BEGIN");
      const secondBusiness = await client.query(
        `
          INSERT INTO public.businesses (name, slug, created_by)
          VALUES ('Negocio de cambio', 'negocio-de-cambio', $1)
          RETURNING id
        `,
        [secondBusinessOwnerId]
      );
      const secondBusinessId = secondBusiness.rows[0].id;
      await client.query(
        `
          INSERT INTO public.business_members (business_id, user_id, role, status)
          VALUES ($1, $2, 'owner', 'active'), ($3, $4, 'manager', 'active')
        `,
        [secondBusinessId, secondBusinessOwnerId, businessId, movingManagerId]
      );
      await client.query("COMMIT");

      await client.query("BEGIN");
      await client.query(
        "UPDATE public.business_members SET business_id = $1 WHERE business_id = $2 AND user_id = $3",
        [secondBusinessId, businessId, movingManagerId]
      );
      await client.query("COMMIT");
      assert.equal(
        (await client.query(
          "SELECT business_id FROM public.business_members WHERE user_id = $1",
          [movingManagerId]
        )).rows[0].business_id,
        secondBusinessId
      );
      assert.equal((await activeOwner(client, businessId)).length, 1);
      assert.equal((await activeOwner(client, secondBusinessId)).length, 1);

      await client.query("BEGIN");
      await client.query(
        "UPDATE public.business_members SET role = 'manager' WHERE business_id = $1 AND user_id = $2",
        [businessId, replacementOwnerId]
      );
      await client.query("ROLLBACK");
      assert.deepEqual(
        (await activeOwner(client, businessId)).map(({ user_id, role, status }) => ({
          user_id,
          role,
          status
        })),
        [{ user_id: replacementOwnerId, role: "owner", status: "active" }]
      );

      await client.query(downSql);
      assert.equal(
        (await client.query(
          "SELECT to_regprocedure('public.enforce_exactly_one_active_owner()') AS procedure"
        )).rows[0].procedure,
        null
      );
      await client.query(
        "UPDATE public.business_members SET role = 'manager' WHERE business_id = $1 AND user_id = $2",
        [businessId, replacementOwnerId]
      );
      assert.equal((await activeOwner(client, businessId)).length, 0);
      await client.query(
        "UPDATE public.business_members SET role = 'owner' WHERE business_id = $1 AND user_id = $2",
        [businessId, replacementOwnerId]
      );

      await client.query(upSql);
      assert.equal((await activeOwner(client, businessId)).length, 1);
      assert.equal(
        (await client.query(
          "SELECT count(*)::int AS count FROM pg_catalog.pg_trigger WHERE tgname = 'business_members_exactly_one_active_owner_trigger'"
        )).rows[0].count,
        1
      );
    } finally {
      if (client) await client.end();
      await dropTestDatabase();
    }
  }
);
