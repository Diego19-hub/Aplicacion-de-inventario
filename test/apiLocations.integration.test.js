import test from "node:test";
import assert from "node:assert/strict";
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

async function csrfToken(agent) {
  return (await agent.get("/api/csrf-token").expect(200)).body.data.csrfToken;
}

async function login(app, identifier, password) {
  const agent = request.agent(app);
  const token = await csrfToken(agent);
  await agent
    .post("/api/auth/login")
    .set("x-csrf-token", token)
    .send({ identifier, password })
    .expect(200);
  return agent;
}

test("listado y detalle de ubicaciones mediante API", { skip: !hasTestDatabaseUrl }, async (t) => {
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

    const password = "api-locations-password";
    const passwordHash = await bcrypt.hash(password, 10);
    const owner = (await client.query(
      `
        SELECT u.id, b.id AS business_id
        FROM users u
        INNER JOIN business_members bm ON bm.user_id = u.id
        INNER JOIN businesses b ON b.id = bm.business_id
        WHERE u.platform_role = 'super_admin'
          AND bm.role = 'owner'
          AND bm.status = 'active'
          AND b.status = 'active'
        LIMIT 1
      `
    )).rows[0];
    assert.ok(owner);
    await client.query(
      "UPDATE users SET username = $1, email = $2, password_hash = $3 WHERE id = $4",
      ["locations_owner", "locations-owner@example.test", passwordHash, owner.id]
    );

    const manager = await client.query(
      "INSERT INTO users(username, email, password_hash, platform_role) VALUES($1, $2, $3, 'user') RETURNING id",
      ["locations_manager", "locations-manager@example.test", passwordHash]
    );
    const viewer = await client.query(
      "INSERT INTO users(username, email, password_hash, platform_role) VALUES($1, $2, $3, 'user') RETURNING id",
      ["locations_viewer", "locations-viewer@example.test", passwordHash]
    );
    const foreignUser = await client.query(
      "INSERT INTO users(username, email, password_hash, platform_role) VALUES($1, $2, $3, 'user') RETURNING id",
      ["locations_foreign", "locations-foreign@example.test", passwordHash]
    );
    await client.query(
      `INSERT INTO business_members(business_id, user_id, role, status)
       VALUES($1, $2, 'manager', 'active'), ($1, $3, 'viewer', 'active')`,
      [owner.business_id, manager.rows[0].id, viewer.rows[0].id]
    );

    const activeLocation = (await client.query(
      `INSERT INTO business_locations(business_id, name, code, location_type, address, phone, notes)
       VALUES($1, $2, $3, 'warehouse', $4, $5, $6)
       RETURNING id`,
      [owner.business_id, "Central API", "CENTRAL-API", "Calle Central 10", "5550000000", "Ubicación de pruebas"]
    )).rows[0];
    const inactiveLocation = (await client.query(
      `INSERT INTO business_locations(business_id, name, code, location_type, status)
       VALUES($1, $2, $3, 'branch', 'inactive')
       RETURNING id`,
      [owner.business_id, "Histórica API", "HIST-API"]
    )).rows[0];
    for (let index = 1; index <= 21; index += 1) {
      await client.query(
        "INSERT INTO business_locations(business_id, name, code, location_type) VALUES($1, $2, $3, 'branch')",
        [owner.business_id, `Paginación API ${index}`, `PAG-${String(index).padStart(3, "0")}`]
      );
    }

    const activeCategory = (await client.query(
      "INSERT INTO categories(name, description, business_id) VALUES($1, $2, $3) RETURNING id",
      ["Categoría ubicación activa", "Categoría de producto activo", owner.business_id]
    )).rows[0];
    const archivedCategory = (await client.query(
      "INSERT INTO categories(name, description, business_id) VALUES($1, $2, $3) RETURNING id",
      ["Categoría ubicación archivada", "Categoría de producto archivado", owner.business_id]
    )).rows[0];
    const activeItem = (await client.query(
      `INSERT INTO items(sku, name, description, brand, price, stock, category_id, business_id, status)
       VALUES($1, $2, $3, $4, $5, $6, $7, $8, 'active')
       RETURNING id`,
      ["LOC-ACT-001", "Producto local activo", "Producto activo de ubicación", "Marca", 10, 5, activeCategory.id, owner.business_id]
    )).rows[0];
    const archivedItem = (await client.query(
      `INSERT INTO items(
        sku, name, description, brand, price, stock, category_id, business_id,
        status, archived_at, archived_by, archive_reason
      ) VALUES($1, $2, $3, $4, $5, $6, $7, $8, 'archived', clock_timestamp(), $9, $10)
       RETURNING id`,
      ["LOC-ARC-001", "Producto local archivado", "Producto archivado de ubicación", "Marca", 10, 3, archivedCategory.id, owner.business_id, owner.id, "Producto descontinuado"]
    )).rows[0];
    await client.query(
      `INSERT INTO inventory_balances(business_id, location_id, item_id, stock)
       VALUES($1, $2, $3, 5), ($1, $4, $5, 3)`,
      [owner.business_id, activeLocation.id, activeItem.id, inactiveLocation.id, archivedItem.id]
    );
    await client.query(
      `INSERT INTO inventory_movements(
        business_id, location_id, item_id, movement_type, quantity_delta,
        previous_stock, resulting_stock, reason, reference, created_by
      ) VALUES($1, $2, $3, 'opening_balance', 5, 0, 5, $4, NULL, $5)`,
      [owner.business_id, activeLocation.id, activeItem.id, "Saldo inicial de prueba", owner.id]
    );

    await client.query("BEGIN");
    let foreignBusiness;
    try {
      foreignBusiness = (await client.query(
        "INSERT INTO businesses(name, slug, created_by, status) VALUES($1, $2, $3, 'active') RETURNING id",
        ["Negocio ajeno ubicaciones", "negocio-ajeno-ubicaciones", foreignUser.rows[0].id]
      )).rows[0];
      await client.query("INSERT INTO business_members(business_id, user_id, role, status) VALUES($1, $2, 'owner', 'active')", [foreignBusiness.id, foreignUser.rows[0].id]);
      await client.query("INSERT INTO categories(business_id, name, description, is_default) VALUES($1, 'General', 'Categoría predeterminada', true)", [foreignBusiness.id]);
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    const foreignLocation = (await client.query(
      "INSERT INTO business_locations(business_id, name, code, location_type) VALUES($1, $2, $3, 'warehouse') RETURNING id",
      [foreignBusiness.id, "Bodega ajena API", "AJENA-API"]
    )).rows[0];

    const { default: app } = await import("../app.js");
    const { default: importedPool } = await import("../db/pool.js");
    pool = importedPool;
    const ownerAgent = await login(app, "locations_owner", password);
    const managerAgent = await login(app, "locations_manager", password);
    const viewerAgent = await login(app, "locations_viewer", password);

    await t.test("los tres roles listan solo ubicaciones propias con métricas correctas", async () => {
      for (const agent of [ownerAgent, managerAgent, viewerAgent]) {
        const response = await agent.get("/api/locations?q=Central%20API").expect(200).expect("Cache-Control", "no-store");
        assert.equal(response.body.data.locations.length, 1);
        assert.deepEqual(response.body.data.locations[0], {
          id: activeLocation.id,
          name: "Central API",
          code: "CENTRAL-API",
          type: "warehouse",
          status: "active",
          isDefault: false,
          address: "Calle Central 10",
          phone: "5550000000",
          totalStock: 5,
          positiveProductCount: 1
        });
      }
    });

    await t.test("búsqueda, estado y paginación mantienen resultados y conteo", async () => {
      const search = await ownerAgent.get("/api/locations?q=CENTRAL-API&status=all").expect(200);
      assert.equal(search.body.data.pagination.totalItems, 1);
      assert.equal(search.body.data.filters.status, "all");
      const inactive = await ownerAgent.get("/api/locations?status=inactive").expect(200);
      assert.ok(inactive.body.data.locations.some((location) => location.id === inactiveLocation.id));
      const firstPage = await ownerAgent.get("/api/locations?status=active&page=1").expect(200);
      const secondPage = await ownerAgent.get("/api/locations?status=active&page=2").expect(200);
      assert.equal(firstPage.body.data.locations.length, 20);
      assert.ok(firstPage.body.data.pagination.totalItems > 20);
      assert.ok(secondPage.body.data.locations.length > 0);
      const excessivePage = await ownerAgent.get("/api/locations?status=active&page=999").expect(200);
      assert.equal(excessivePage.body.data.pagination.page, excessivePage.body.data.pagination.totalPages);
    });

    await t.test("detalle devuelve productos y movimientos propios; ubicación ajena e ID inválido fallan", async () => {
      const detail = await ownerAgent.get(`/api/locations/${activeLocation.id}`).expect(200);
      assert.equal(detail.body.data.location.totalStock, 5);
      assert.deepEqual(detail.body.data.products, [{
        id: activeItem.id,
        name: "Producto local activo",
        sku: "LOC-ACT-001",
        status: "active",
        localStock: 5,
        totalStock: 5
      }]);
      assert.equal(detail.body.data.recentMovements.length, 1);
      assert.equal(detail.body.data.recentMovements[0].product.id, activeItem.id);
      await ownerAgent.get(`/api/locations/${foreignLocation.id}`).expect(404).expect((response) => assert.equal(response.body.error.code, "LOCATION_NOT_FOUND"));
      await ownerAgent.get("/api/locations/no-es-id").expect(400).expect((response) => assert.equal(response.body.error.code, "VALIDATION_ERROR"));
    });
  } finally {
    if (client) await client.end();
    if (pool) await pool.end();
    if (originalEnvironment.DATABASE_URL === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalEnvironment.DATABASE_URL;
    if (databaseCreated) await dropTestDatabase();
    restoreEnvironment();
  }
});
