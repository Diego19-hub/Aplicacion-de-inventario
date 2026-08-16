import assert from "node:assert/strict";
import test from "node:test";

import bcrypt from "bcrypt";
import pg from "pg";
import request from "supertest";

import { createTestDatabase, dropTestDatabase } from "./helpers/testDatabase.js";

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

function extractCsrfToken(html) {
  const match = html.match(/<input\s+[^>]*name=["']_csrf["'][^>]*value=["']([^"']+)["'][^>]*>/i);
  assert.ok(match, "El formulario de login debe incluir CSRF.");
  return match[1];
}

async function login(app, identifier, password) {
  const agent = request.agent(app);
  const loginPage = await agent.get("/auth/login").expect(200);
  await agent.post("/auth/login").type("form").send({
    _csrf: extractCsrfToken(loginPage.text),
    identifier,
    password
  }).expect(302);
  return agent;
}

async function csrfToken(agent) {
  return (await agent.get("/api/csrf-token").expect(200)).body.data.csrfToken;
}

async function transition(agent, businessId, action) {
  return agent.post(`/api/admin/businesses/${businessId}/${action}`)
    .set("X-CSRF-Token", await csrfToken(agent))
    .send({});
}

async function dependentSnapshot(client, businessId) {
  const result = await client.query(`
    SELECT jsonb_build_object(
      'members', (SELECT COALESCE(jsonb_agg(to_jsonb(m) ORDER BY m.id), '[]'::jsonb) FROM business_members m WHERE m.business_id = $1),
      'invitations', (SELECT COALESCE(jsonb_agg(to_jsonb(i) ORDER BY i.id), '[]'::jsonb) FROM business_invitations i WHERE i.business_id = $1),
      'items', (SELECT COALESCE(jsonb_agg(to_jsonb(i) ORDER BY i.id), '[]'::jsonb) FROM items i WHERE i.business_id = $1),
      'locations', (SELECT COALESCE(jsonb_agg(to_jsonb(l) ORDER BY l.id), '[]'::jsonb) FROM business_locations l WHERE l.business_id = $1),
      'balances', (SELECT COALESCE(jsonb_agg(to_jsonb(b) ORDER BY b.location_id, b.item_id), '[]'::jsonb) FROM inventory_balances b WHERE b.business_id = $1),
      'movements', (SELECT COALESCE(jsonb_agg(to_jsonb(m) ORDER BY m.id), '[]'::jsonb) FROM inventory_movements m WHERE m.business_id = $1),
      'transfers', (SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.id), '[]'::jsonb) FROM inventory_transfers t WHERE t.business_id = $1),
      'thresholds', (SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.id), '[]'::jsonb) FROM inventory_stock_thresholds t WHERE t.business_id = $1)
    )::text AS data
  `, [businessId]);
  return result.rows[0].data;
}

test(
  "API administrativa: transiciones de estado de negocios",
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

      const password = "admin-business-transition-password";
      const passwordHash = await bcrypt.hash(password, 10);
      const superAdminResult = await client.query("SELECT id FROM users WHERE platform_role = 'super_admin' ORDER BY id LIMIT 1");
      const superAdminId = superAdminResult.rows[0].id;
      await client.query("UPDATE users SET username = $1, email = $2, password_hash = $3 WHERE id = $4", [
        "transition_super_admin", "transition-super@example.test", passwordHash, superAdminId
      ]);
      const users = await client.query(`
        INSERT INTO users (username, email, password_hash, platform_role)
        VALUES ($1, $2, $3, 'user'), ($4, $5, $6, 'user')
        RETURNING id, username
      `, [
        "transition_business_owner", "transition-owner@example.test", passwordHash,
        "transition_normal_user", "transition-normal@example.test", passwordHash
      ]);
      const ids = Object.fromEntries(users.rows.map((user) => [user.username, user.id]));
      const business = await client.query(`
        INSERT INTO businesses (name, slug, created_by)
        VALUES ($1, $2, $3)
        RETURNING id
      `, ["Negocio de transición", "negocio-de-transicion", ids.transition_business_owner]);
      const businessId = business.rows[0].id;
      await client.query(`
        INSERT INTO business_members (business_id, user_id, role, status)
        VALUES ($1, $2, 'owner', 'active'), ($1, $3, 'viewer', 'suspended')
      `, [businessId, ids.transition_business_owner, ids.transition_normal_user]);
      const locations = await client.query(`
        INSERT INTO business_locations (business_id, name, code, location_type, is_default)
        VALUES ($1, 'Sucursal principal', 'MAIN', 'branch', true), ($1, 'Bodega transición', 'TRANS-BOD', 'warehouse', false)
        RETURNING id, code
      `, [businessId]);
      const locationIds = Object.fromEntries(locations.rows.map((location) => [location.code, location.id]));
      const category = await client.query(
        "INSERT INTO categories (business_id, name, description) VALUES ($1, $2, $3) RETURNING id",
        [businessId, "Categoría transición", "Categoría para la prueba"]
      );
      const item = await client.query(`
        INSERT INTO items (business_id, category_id, sku, name, description, brand, price, stock)
        VALUES ($1, $2, 'TRANS-001', 'Producto transición', 'Producto para prueba', 'Prueba', 10, 2)
        RETURNING id
      `, [businessId, category.rows[0].id]);
      const itemId = item.rows[0].id;
      const transferResult = await client.query(`
        INSERT INTO inventory_transfers (business_id, item_id, from_location_id, to_location_id, quantity, reason, created_by)
        VALUES ($1, $2, $3, $4, 1, 'Transferencia de prueba de transición', $5)
        RETURNING id
      `, [businessId, itemId, locationIds.MAIN, locationIds["TRANS-BOD"], ids.transition_business_owner]);
      await client.query(`
        INSERT INTO inventory_movements (business_id, item_id, location_id, movement_type, quantity_delta, previous_stock, resulting_stock, reason, created_by)
        VALUES ($1, $2, $3, 'opening_balance', 2, 0, 2, 'Saldo inicial para transición', $4)
      `, [businessId, itemId, locationIds.MAIN, ids.transition_business_owner]);
      await client.query(
        "INSERT INTO inventory_balances (business_id, location_id, item_id, stock) VALUES ($1, $2, $3, 2)",
        [businessId, locationIds.MAIN, itemId]
      );
      await client.query(`
        INSERT INTO inventory_stock_thresholds (business_id, item_id, location_id, minimum_stock, created_by)
        VALUES ($1, $2, $3, 3, $4)
      `, [businessId, itemId, locationIds.MAIN, ids.transition_business_owner]);

      const { default: app } = await import("../app.js");
      const { default: importedPool } = await import("../db/pool.js");
      pool = importedPool;
      const superAdminAgent = await login(app, "transition_super_admin", password);
      const ownerAgent = await login(app, "transition_business_owner", password);
      const normalAgent = await login(app, "transition_normal_user", password);
      const snapshot = await dependentSnapshot(client, businessId);

      await t.test("suspender bloquea negocio activo y reactivar conserva dependencias", async () => {
        const ownerSession = await ownerAgent.get("/api/session").expect(200);
        assert.equal(ownerSession.body.data.activeBusiness.id, businessId);

        const suspended = await transition(superAdminAgent, businessId, "suspend");
        assert.equal(suspended.status, 200);
        assert.equal(suspended.body.data.business.status, "suspended");
        await ownerAgent.get("/api/dashboard").expect(409).expect((response) => {
          assert.equal(response.body.error.code, "ACTIVE_BUSINESS_REQUIRED");
        });
        const clearedSession = await ownerAgent.get("/api/session").expect(200);
        assert.equal(clearedSession.body.data.activeBusiness, null);
        assert.equal(await dependentSnapshot(client, businessId), snapshot);

        const reactivated = await transition(superAdminAgent, businessId, "reactivate");
        assert.equal(reactivated.status, 200);
        assert.equal(reactivated.body.data.business.status, "active");
        const afterReactivation = await ownerAgent.get("/api/session").expect(200);
        assert.equal(afterReactivation.body.data.activeBusiness, null);
        assert.equal(await dependentSnapshot(client, businessId), snapshot);
      });

      await t.test("archivar conserva datos y bloquea transiciones posteriores", async () => {
        const archived = await transition(superAdminAgent, businessId, "archive");
        assert.equal(archived.status, 200);
        assert.equal(archived.body.data.business.status, "archived");
        const status = await client.query("SELECT status FROM businesses WHERE id = $1", [businessId]);
        assert.equal(status.rows[0].status, "archived");
        assert.equal(await dependentSnapshot(client, businessId), snapshot);
        await ownerAgent.get("/api/dashboard").expect(409);
        for (const [action, code] of [["suspend", "BUSINESS_INVALID_TRANSITION"], ["reactivate", "BUSINESS_INVALID_TRANSITION"], ["archive", "BUSINESS_ALREADY_ARCHIVED"]]) {
          const response = await transition(superAdminAgent, businessId, action);
          assert.equal(response.status, 409);
          assert.equal(response.body.error.code, code);
        }
        assert.equal(await dependentSnapshot(client, businessId), snapshot);
      });

      await t.test("autorización, IDs y repeticiones no dejan cambios parciales", async () => {
        await normalAgent.post(`/api/admin/businesses/${businessId}/archive`)
          .set("X-CSRF-Token", await csrfToken(normalAgent)).send({}).expect(403).expect((response) => {
            assert.equal(response.body.error.code, "SUPER_ADMIN_REQUIRED");
          });
        const anonymousAgent = request.agent(app);
        await anonymousAgent.post(`/api/admin/businesses/${businessId}/archive`).set("X-CSRF-Token", await csrfToken(anonymousAgent)).send({}).expect(401).expect((response) => {
          assert.equal(response.body.error.code, "AUTH_REQUIRED");
        });
        for (const invalidId of ["1.5", "-1", "abc"]) {
          const response = await transition(superAdminAgent, invalidId, "suspend");
          assert.equal(response.status, 400);
          assert.equal(response.body.error.code, "VALIDATION_ERROR");
        }
        const missing = await transition(superAdminAgent, 999999, "archive");
        assert.equal(missing.status, 404);
        assert.equal(missing.body.error.code, "BUSINESS_NOT_FOUND");
        const repeated = await transition(superAdminAgent, businessId, "archive");
        assert.equal(repeated.status, 409);
        assert.equal(repeated.body.error.code, "BUSINESS_ALREADY_ARCHIVED");
        assert.equal(await dependentSnapshot(client, businessId), snapshot);
      });
    } finally {
      if (client) await client.end();
      if (pool) await pool.end();
      restoreEnvironment();
      if (databaseCreated) await dropTestDatabase();
    }
  }
);
