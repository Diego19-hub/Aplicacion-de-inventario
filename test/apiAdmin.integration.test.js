import assert from "node:assert/strict";
import test from "node:test";

import bcrypt from "bcrypt";
import pg from "pg";
import request from "supertest";

import {
  createTestDatabase,
  dropTestDatabase,
  withTestTransaction
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

async function fixtureSnapshot(client) {
  const result = await client.query(`
    SELECT jsonb_build_object(
      'businesses', (SELECT COALESCE(jsonb_agg(to_jsonb(b) ORDER BY b.id), '[]'::jsonb) FROM businesses b),
      'members', (SELECT COALESCE(jsonb_agg(to_jsonb(m) ORDER BY m.id), '[]'::jsonb) FROM business_members m),
      'items', (SELECT COALESCE(jsonb_agg(to_jsonb(i) ORDER BY i.id), '[]'::jsonb) FROM items i),
      'balances', (SELECT COALESCE(jsonb_agg(to_jsonb(b) ORDER BY b.business_id, b.location_id, b.item_id), '[]'::jsonb) FROM inventory_balances b),
      'movements', (SELECT COALESCE(jsonb_agg(to_jsonb(m) ORDER BY m.id), '[]'::jsonb) FROM inventory_movements m),
      'transfers', (SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.id), '[]'::jsonb) FROM inventory_transfers t),
      'thresholds', (SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.id), '[]'::jsonb) FROM inventory_stock_thresholds t)
    )::text AS data
  `);

  return result.rows[0].data;
}

function assertDescendingByCreatedAtAndId(rows) {
  for (let index = 1; index < rows.length; index += 1) {
    const previous = rows[index - 1];
    const current = rows[index];
    const previousTime = new Date(previous.createdAt).getTime();
    const currentTime = new Date(current.createdAt).getTime();

    assert.ok(
      previousTime > currentTime || (previousTime === currentTime && previous.id > current.id),
      "Las filas deben ordenarse por fecha descendente e ID descendente."
    );
  }
}

test(
  "API de superadministración: dashboard, negocios, detalle y autorización",
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

      const password = "admin-integration-password";
      const passwordHash = await bcrypt.hash(password, 10);
      const initial = await client.query(`
        SELECT u.id AS user_id, b.id AS business_id, l.id AS location_id
        FROM users u
        JOIN businesses b ON b.created_by = u.id
        JOIN business_locations l ON l.business_id = b.id AND l.is_default AND l.status = 'active'
        WHERE u.platform_role = 'super_admin'
        ORDER BY u.id
        LIMIT 1
      `);
      const superAdmin = initial.rows[0];
      assert.ok(superAdmin, "El fixture base debe incluir un superadministrador propietario.");

      await client.query(
        "UPDATE users SET username = $1, email = $2, password_hash = $3 WHERE id = $4",
        ["api_super_admin", "api-super-admin@example.test", passwordHash, superAdmin.user_id]
      );

      const users = await client.query(
        `
          INSERT INTO users (username, email, password_hash, platform_role)
          VALUES
            ($1, $2, $3, 'user'),
            ($4, $5, $6, 'user')
          RETURNING id, username
        `,
        [
          "api_normal_user", "api-normal-user@example.test", passwordHash,
          "api_suspended_owner", "api-suspended-owner@example.test", passwordHash
        ]
      );
      const userIds = Object.fromEntries(users.rows.map((user) => [user.username, user.id]));

      const { suspendedBusinessId, activeBusinessId } = await withTestTransaction(client, async () => {
        const suspendedBusiness = await client.query("INSERT INTO businesses (name, slug, status, created_by, created_at) VALUES ($1, $2, 'suspended', $3, clock_timestamp() - interval '2 minutes') RETURNING id", ["NEGOCIO SUSPENDIDO GLOBAL", "negocio-suspendido-global", userIds.api_suspended_owner]);
        const activeBusiness = await client.query("INSERT INTO businesses (name, slug, legal_name, tax_id, created_by, created_at) VALUES ($1, $2, $3, $4, $5, clock_timestamp() - interval '1 minute') RETURNING id", ["NEGOCIO ACTIVO GLOBAL", "negocio-activo-global", "Razón Global", "RFCGLOBAL001", superAdmin.user_id]);
        const suspendedBusinessId = suspendedBusiness.rows[0].id;
        const activeBusinessId = activeBusiness.rows[0].id;
        await client.query(
          `INSERT INTO business_members (business_id, user_id, role, status)
           VALUES ($1, $2, 'manager', 'active'), ($1, $3, 'viewer', 'suspended'),
             ($4, $3, 'owner', 'active'), ($4, $2, 'viewer', 'suspended'),
             ($5, $6, 'owner', 'active')`,
          [superAdmin.business_id, userIds.api_normal_user, userIds.api_suspended_owner, suspendedBusinessId, activeBusinessId, superAdmin.user_id]
        );
        await client.query("INSERT INTO categories (business_id, name, description, is_default) VALUES ($1, 'General', 'Categoría predeterminada', true), ($2, 'General', 'Categoría predeterminada', true)", [suspendedBusinessId, activeBusinessId]);
        return { suspendedBusinessId, activeBusinessId };
      });

      const destination = await client.query(
        `
          INSERT INTO business_locations (business_id, name, code, location_type)
          VALUES ($1, $2, $3, 'warehouse')
          RETURNING id
        `,
        [superAdmin.business_id, "Bodega administrativa", "ADMIN-BODEGA"]
      );
      const destinationLocationId = destination.rows[0].id;

      const category = await client.query(
        `
          INSERT INTO categories (business_id, name, description)
          VALUES ($1, $2, $3)
          RETURNING id
        `,
        [superAdmin.business_id, "Categoría administrativa", "Categoría para la prueba administrativa"]
      );
      const categoryId = category.rows[0].id;
      const items = await client.query(
        `
          INSERT INTO items (
            business_id, category_id, sku, name, description, brand, price, stock,
            status, archived_at, archived_by, archive_reason
          )
          VALUES
            ($1, $2, 'ADMIN-ACTIVO-001', 'Producto administrativo activo', 'Producto activo de prueba', 'Prueba', 10, 5, 'active', NULL, NULL, NULL),
            ($1, $2, 'ADMIN-ARCH-001', 'Producto administrativo archivado', 'Producto archivado de prueba', 'Prueba', 12, 0, 'archived', clock_timestamp(), $3, 'Producto archivado para prueba')
          RETURNING id, status
        `,
        [superAdmin.business_id, categoryId, superAdmin.user_id]
      );
      const activeItemId = items.rows.find((item) => item.status === "active").id;

      const transfer = await client.query(
        `
          INSERT INTO inventory_transfers (
            business_id, item_id, from_location_id, to_location_id, quantity, reason, reference, created_by
          )
          VALUES ($1, $2, $3, $4, 1, 'Transferencia para la prueba administrativa', 'ADMIN-TR-001', $5)
          RETURNING id
        `,
        [
          superAdmin.business_id,
          activeItemId,
          superAdmin.location_id,
          destinationLocationId,
          superAdmin.user_id
        ]
      );
      const transferId = transfer.rows[0].id;

      await client.query(
        `
          INSERT INTO inventory_movements (
            business_id, item_id, location_id, movement_type, quantity_delta,
            previous_stock, resulting_stock, reason, created_by, created_at, transfer_id
          )
          VALUES
            ($1, $2, $3, 'opening_balance', 5, 0, 5, 'Saldo inicial administrativo', $4, clock_timestamp() - interval '6 minutes', NULL),
            ($1, $2, $3, 'transfer_out', -1, 5, 4, 'Salida para transferencia administrativa', $4, clock_timestamp() - interval '5 minutes', $5),
            ($1, $2, $6, 'transfer_in', 1, 0, 1, 'Entrada para transferencia administrativa', $4, clock_timestamp() - interval '4 minutes', $5)
          RETURNING id
        `,
        [
          superAdmin.business_id,
          activeItemId,
          superAdmin.location_id,
          superAdmin.user_id,
          transferId,
          destinationLocationId
        ]
      );
      await client.query(
        `
          INSERT INTO inventory_balances (business_id, location_id, item_id, stock)
          VALUES ($1, $2, $3, 4), ($1, $4, $3, 1)
        `,
        [superAdmin.business_id, superAdmin.location_id, activeItemId, destinationLocationId]
      );
      await client.query(
        `
          INSERT INTO inventory_stock_thresholds (business_id, item_id, location_id, minimum_stock, created_by)
          VALUES ($1, $2, $3, 2, $4)
        `,
        [superAdmin.business_id, activeItemId, superAdmin.location_id, superAdmin.user_id]
      );

      const counts = await client.query(`
        SELECT
          (SELECT count(*)::int FROM businesses) AS businesses,
          (SELECT count(*)::int FROM businesses WHERE status = 'active') AS active_businesses,
          (SELECT count(*)::int FROM businesses WHERE status = 'suspended') AS suspended_businesses,
          (SELECT count(*)::int FROM businesses WHERE status = 'archived') AS archived_businesses,
          (SELECT count(*)::int FROM users) AS users,
          (SELECT count(*)::int FROM business_members WHERE status = 'active') AS active_members,
          (SELECT count(*)::int FROM items WHERE status = 'active') AS active_products
      `);
      const expectedCounts = counts.rows[0];
      const dataBeforeErrors = await fixtureSnapshot(client);

      const { default: app } = await import("../app.js");
      const { default: importedPool } = await import("../db/pool.js");
      pool = importedPool;
      const superAdminAgent = await login(app, "api_super_admin", password);
      const normalAgent = await login(app, "api_normal_user", password);

      await t.test("dashboard y listado global", async () => {
        const dashboard = await superAdminAgent.get("/api/admin/dashboard").expect(200);
        assert.equal(dashboard.headers["cache-control"], "no-store");
        assert.deepEqual(dashboard.body.data.metrics, {
          businesses: expectedCounts.businesses,
          active: expectedCounts.active_businesses,
          suspended: expectedCounts.suspended_businesses,
          archived: expectedCounts.archived_businesses,
          users: expectedCounts.users,
          active_members: expectedCounts.active_members,
          active_products: expectedCounts.active_products
        });
        assert.ok(dashboard.body.data.recent.length <= 5);
        assertDescendingByCreatedAtAndId(dashboard.body.data.recent);

        const listed = await superAdminAgent.get("/api/admin/businesses?page=1").expect(200);
        assert.equal(listed.body.data.pagination.totalItems, Number(expectedCounts.businesses));
        assert.equal(listed.body.data.pagination.page, 1);
        assert.equal(listed.body.data.pagination.pageSize, 20);
        assert.ok(listed.body.data.businesses.some((business) => business.id === suspendedBusinessId));
        assert.ok(listed.body.data.businesses.every((business) => !("created_by" in business)));

        const filtered = await superAdminAgent
          .get("/api/admin/businesses?q=NEGOCIO%20SUSPENDIDO&status=suspended")
          .expect(200);
        assert.equal(filtered.body.data.pagination.totalItems, 1);
        assert.equal(filtered.body.data.businesses.length, 1);
        assert.equal(filtered.body.data.businesses[0].id, suspendedBusinessId);
        assert.equal(filtered.body.data.businesses[0].status, "suspended");
        assert.doesNotMatch(JSON.stringify(filtered.body), /password_hash|token|cookie|session/i);
      });

      await t.test("detalle global de un negocio", async () => {
        const session = await superAdminAgent.get("/api/session").expect(200);
        assert.equal(session.body.data.activeBusiness, null, "El superadministrador tiene más de un negocio activo y no debe seleccionar uno automáticamente.");

        const detail = await superAdminAgent
          .get(`/api/admin/businesses/${superAdmin.business_id}`)
          .expect(200);
        const body = detail.body.data;
        assert.equal(body.business.id, superAdmin.business_id);
        assert.equal(body.metrics.activeMembers, 2);
        assert.equal(body.metrics.activeProducts, 1);
        assert.equal(body.metrics.archivedProducts, 1);
        assert.equal(body.metrics.activeLocations, 2);
        assert.equal(body.metrics.totalStock, 5);
        assert.equal(body.metrics.transfers, 1);
        assert.equal(body.metrics.thresholds, 1);
        assert.deepEqual(
          Object.fromEntries(body.members.map((member) => [member.status, 0]).map(([status]) => [status, body.members.filter((member) => member.status === status).length])),
          { active: 2, suspended: 1 }
        );
        assert.equal(body.recentMovements.length, 3);
        assertDescendingByCreatedAtAndId(body.recentMovements);
        assert.ok(body.recentMovements.every((movement) => movement.product.name.includes("administrativo") && !("business_id" in movement)));
        assert.doesNotMatch(JSON.stringify(body), /password_hash|token|cookie|session|created_by|business_id/i);
      });

      await t.test("autorización y parámetros erróneos no cambian datos", async () => {
        const superSessionBefore = await superAdminAgent.get("/api/session").expect(200);
        const normalSessionBefore = await normalAgent.get("/api/session").expect(200);

        await normalAgent.get("/api/admin/dashboard").expect(403).expect((response) => {
          assert.equal(response.body.error.code, "SUPER_ADMIN_REQUIRED");
        });
        await request(app).get("/api/admin/dashboard").expect(401).expect((response) => {
          assert.equal(response.body.error.code, "AUTH_REQUIRED");
        });

        for (const businessId of ["1.5", "-1", "abc"]) {
          await superAdminAgent
            .get(`/api/admin/businesses/${businessId}`)
            .expect(400)
            .expect((response) => assert.equal(response.body.error.code, "VALIDATION_ERROR"));
        }
        await superAdminAgent
          .get("/api/admin/businesses/999999")
          .expect(404)
          .expect((response) => assert.equal(response.body.error.code, "BUSINESS_NOT_FOUND"));

        const superSessionAfter = await superAdminAgent.get("/api/session").expect(200);
        const normalSessionAfter = await normalAgent.get("/api/session").expect(200);
        assert.deepEqual(superSessionAfter.body, superSessionBefore.body);
        assert.deepEqual(normalSessionAfter.body, normalSessionBefore.body);
        assert.equal(await fixtureSnapshot(client), dataBeforeErrors);
      });
    } finally {
      if (client) await client.end();
      if (pool) await pool.end();

      restoreEnvironment();
      if (databaseCreated) await dropTestDatabase();
    }
  }
);
