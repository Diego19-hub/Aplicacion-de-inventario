import assert from "node:assert/strict";
import test from "node:test";

import bcrypt from "bcrypt";
import pg from "pg";
import request from "supertest";

import {
  createTestDatabase,
  dropTestDatabase
} from "./helpers/testDatabase.js";

const { Client } = pg;
const hasTestDatabaseUrl = Boolean(process.env.TEST_DATABASE_URL);
const originalEnvironment = {
  NODE_ENV: process.env.NODE_ENV,
  SESSION_SECRET: process.env.SESSION_SECRET,
  DATABASE_URL: process.env.DATABASE_URL
};

function restoreEnvironment() {
  for (const [name, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

async function login(app, identifier, password) {
  const agent = request.agent(app);
  const csrfToken = (await agent.get("/api/csrf-token").expect(200)).body.data.csrfToken;
  await agent.post("/api/auth/login").set("x-csrf-token", csrfToken).send({ identifier, password }).expect(200);
  return agent;
}

async function apiCsrfToken(agent) {
  const response = await agent.get("/api/csrf-token").expect(200);
  assert.equal(response.headers["cache-control"], "no-store");
  return response.body.data.csrfToken;
}

async function businessCounts(client) {
  const result = await client.query(`
    SELECT
      (SELECT count(*)::int FROM businesses) AS businesses,
      (SELECT count(*)::int FROM business_members) AS members,
      (SELECT count(*)::int FROM business_locations) AS locations,
      (SELECT count(*)::int FROM items) AS items,
      (SELECT count(*)::int FROM inventory_movements) AS movements,
      (SELECT count(*)::int FROM inventory_balances) AS balances
  `);
  return result.rows[0];
}

test(
  "API administrativa: creación y edición de negocios",
  { skip: !hasTestDatabaseUrl },
  async (t) => {
    let client;
    let pool;
    let databaseCreated = false;

    try {
      process.env.NODE_ENV = "test";
      process.env.SESSION_SECRET = "integration-test-secret";
      await createTestDatabase();
      databaseCreated = true;
      process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

      client = new Client({ connectionString: process.env.TEST_DATABASE_URL });
      await client.connect();

      const password = "admin-business-mutation-password";
      const passwordHash = await bcrypt.hash(password, 10);
      const superAdmin = await client.query(`
        SELECT u.id
        FROM users u
        WHERE u.platform_role = 'super_admin'
        ORDER BY u.id
        LIMIT 1
      `);
      const superAdminId = superAdmin.rows[0].id;
      await client.query(
        "UPDATE users SET username = $1, email = $2, password_hash = $3 WHERE id = $4",
        ["business_api_super", "business-api-super@example.test", passwordHash, superAdminId]
      );
      const users = await client.query(`
        INSERT INTO users (username, email, password_hash, platform_role)
        VALUES
          ($1, $2, $3, 'user'),
          ($4, $5, $6, 'user')
        RETURNING id, username
      `, [
        "business_api_owner", "business-api-owner@example.test", passwordHash,
        "business_api_normal", "business-api-normal@example.test", passwordHash
      ]);
      const ids = Object.fromEntries(users.rows.map((user) => [user.username, user.id]));

      const { default: app } = await import("../app.js");
      const { default: importedPool } = await import("../db/pool.js");
      pool = importedPool;
      const superAdminAgent = await login(app, "business_api_super", password);
      const normalAgent = await login(app, "business_api_normal", password);
      let createdBusinessId;
      let originalBusinessState;

      await t.test("superadministrador crea negocio, owner y MAIN en una transacción", async () => {
        const options = await superAdminAgent.get("/api/admin/businesses/form-options").expect(200);
        assert.ok(options.body.data.owners.some((owner) => owner.id === ids.business_api_owner));
        assert.doesNotMatch(JSON.stringify(options.body), /password_hash|token|session/i);

        const before = await businessCounts(client);
        const csrfToken = await apiCsrfToken(superAdminAgent);
        const response = await superAdminAgent.post("/api/admin/businesses")
          .set("X-CSRF-Token", csrfToken)
          .send({
            name: "Negocio API Nuevo",
            slug: "NEGOCIO-API-NUEVO",
            legalName: "",
            taxId: "",
            currency: "mxn",
            timezone: "America/Mexico_City",
            ownerUserId: ids.business_api_owner
          })
          .expect(201);
        createdBusinessId = response.body.data.business.id;
        assert.equal(response.body.data.business.slug, "negocio-api-nuevo");
        assert.equal(response.body.data.business.status, "active");

        const after = await businessCounts(client);
        assert.equal(after.businesses, before.businesses + 1);
        assert.equal(after.members, before.members + 1);
        assert.equal(after.locations, before.locations + 1);
        assert.equal(after.items, before.items);
        assert.equal(after.movements, before.movements);
        assert.equal(after.balances, before.balances);

        const created = await client.query(`
          SELECT
            b.status,
            b.legal_name,
            b.tax_id,
            m.user_id AS owner_user_id,
            m.role,
            m.status AS membership_status,
            l.name,
            l.code,
            l.status AS location_status,
            l.is_default
          FROM businesses b
          JOIN business_members m ON m.business_id = b.id
          JOIN business_locations l ON l.business_id = b.id
          WHERE b.id = $1
        `, [createdBusinessId]);
        assert.deepEqual(created.rows, [{
          status: "active",
          legal_name: null,
          tax_id: null,
          owner_user_id: ids.business_api_owner,
          role: "owner",
          membership_status: "active",
          name: "Sucursal principal",
          code: "MAIN",
          location_status: "active",
          is_default: true
        }]);
      });

      await t.test("superadministrador edita solo datos permitidos", async () => {
        const before = await client.query(`
          SELECT
            (SELECT row_to_json(b)::text FROM businesses b WHERE b.id = $1) AS business,
            (SELECT COALESCE(jsonb_agg(to_jsonb(m) ORDER BY m.id), '[]'::jsonb)::text FROM business_members m WHERE m.business_id = $1) AS members,
            (SELECT COALESCE(jsonb_agg(to_jsonb(l) ORDER BY l.id), '[]'::jsonb)::text FROM business_locations l WHERE l.business_id = $1) AS locations,
            (SELECT count(*)::int FROM items WHERE business_id = $1) AS items,
            (SELECT count(*)::int FROM inventory_movements WHERE business_id = $1) AS movements,
            (SELECT count(*)::int FROM inventory_balances WHERE business_id = $1) AS balances
        `, [createdBusinessId]);
        originalBusinessState = before.rows[0];
        const edit = await superAdminAgent.get(`/api/admin/businesses/${createdBusinessId}/edit`).expect(200);
        assert.deepEqual(Object.keys(edit.body.data.business).sort(), ["currency", "id", "legalName", "name", "slug", "taxId", "timezone"].sort());

        const csrfToken = await apiCsrfToken(superAdminAgent);
        await superAdminAgent.put(`/api/admin/businesses/${createdBusinessId}`)
          .set("X-CSRF-Token", csrfToken)
          .send({
            name: "Negocio API Editado",
            slug: "negocio-api-editado",
            legalName: "Razón API Editada",
            taxId: "rfc-api-001",
            currency: "usd",
            timezone: "UTC"
          })
          .expect(200);

        const after = await client.query(`
          SELECT
            (SELECT row_to_json(b)::text FROM businesses b WHERE b.id = $1) AS business,
            (SELECT COALESCE(jsonb_agg(to_jsonb(m) ORDER BY m.id), '[]'::jsonb)::text FROM business_members m WHERE m.business_id = $1) AS members,
            (SELECT COALESCE(jsonb_agg(to_jsonb(l) ORDER BY l.id), '[]'::jsonb)::text FROM business_locations l WHERE l.business_id = $1) AS locations,
            (SELECT count(*)::int FROM items WHERE business_id = $1) AS items,
            (SELECT count(*)::int FROM inventory_movements WHERE business_id = $1) AS movements,
            (SELECT count(*)::int FROM inventory_balances WHERE business_id = $1) AS balances
        `, [createdBusinessId]);
        assert.equal(after.rows[0].members, originalBusinessState.members);
        assert.equal(after.rows[0].locations, originalBusinessState.locations);
        assert.equal(after.rows[0].items, originalBusinessState.items);
        assert.equal(after.rows[0].movements, originalBusinessState.movements);
        assert.equal(after.rows[0].balances, originalBusinessState.balances);

        const updated = JSON.parse(after.rows[0].business);
        const original = JSON.parse(originalBusinessState.business);
        assert.equal(updated.name, "Negocio API Editado");
        assert.equal(updated.slug, "negocio-api-editado");
        assert.equal(updated.legal_name, "Razón API Editada");
        assert.equal(updated.tax_id, "RFC-API-001");
        assert.equal(updated.currency, "USD");
        assert.equal(updated.timezone, "UTC");
        assert.equal(updated.status, original.status);
        assert.equal(updated.created_by, original.created_by);
        assert.equal(updated.created_at, original.created_at);
      });

      await t.test("errores y usuarios sin permiso no dejan cambios parciales", async () => {
        const before = await businessCounts(client);
        const protectedBefore = await client.query(
          "SELECT row_to_json(b)::text AS business FROM businesses b WHERE b.id = $1",
          [createdBusinessId]
        );

        await normalAgent.get("/api/admin/businesses/form-options").expect(403).expect((response) => {
          assert.equal(response.body.error.code, "SUPER_ADMIN_REQUIRED");
        });
        await normalAgent.get(`/api/admin/businesses/${createdBusinessId}`).expect(403);

        for (const [payload, expectedStatus, expectedCode] of [
          [{ name: "Duplicado", slug: "negocio-api-editado", currency: "MXN", timezone: "UTC", ownerUserId: ids.business_api_owner }, 409, "BUSINESS_ALREADY_EXISTS"],
          [{ name: "Propietario inválido", slug: "propietario-invalido", currency: "MXN", timezone: "UTC", ownerUserId: 999999 }, 400, "VALIDATION_ERROR"],
          [{ name: "Protegido", slug: "campo-protegido", currency: "MXN", timezone: "UTC", ownerUserId: ids.business_api_owner, status: "suspended" }, 400, "VALIDATION_ERROR"]
        ]) {
          const csrfToken = await apiCsrfToken(superAdminAgent);
          await superAdminAgent.post("/api/admin/businesses").set("X-CSRF-Token", csrfToken).send(payload).expect(expectedStatus).expect((response) => {
            assert.equal(response.body.error.code, expectedCode);
          });
        }
        const csrfToken = await apiCsrfToken(superAdminAgent);
        await superAdminAgent.put("/api/admin/businesses/999999").set("X-CSRF-Token", csrfToken).send({
          name: "Inexistente", slug: "inexistente", currency: "MXN", timezone: "UTC"
        }).expect(404).expect((response) => assert.equal(response.body.error.code, "BUSINESS_NOT_FOUND"));

        const after = await businessCounts(client);
        assert.deepEqual(after, before);
        const protectedAfter = await client.query(
          "SELECT row_to_json(b)::text AS business FROM businesses b WHERE b.id = $1",
          [createdBusinessId]
        );
        assert.deepEqual(protectedAfter.rows, protectedBefore.rows);
      });
    } finally {
      if (client) await client.end();
      if (pool) await pool.end();
      restoreEnvironment();
      if (databaseCreated) await dropTestDatabase();
    }
  }
);
