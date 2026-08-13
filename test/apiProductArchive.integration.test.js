import test from "node:test";
import assert from "node:assert/strict";
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
  const token = (await agent.get("/api/csrf-token").expect(200)).body.data.csrfToken;
  await agent.post("/api/auth/login").set("x-csrf-token", token).send({ identifier, password }).expect(200);
  return agent;
}

async function csrfToken(agent) {
  return (await agent.get("/api/csrf-token").expect(200)).body.data.csrfToken;
}

test("archivado de productos mediante API", { skip: !hasTestDatabaseUrl }, async (t) => {
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

    const password = "api-product-archive-password";
    const passwordHash = await bcrypt.hash(password, 10);
    const owner = (await client.query(
      `SELECT u.id, b.id AS business_id
       FROM users u
       INNER JOIN business_members bm ON bm.user_id = u.id
       INNER JOIN businesses b ON b.id = bm.business_id
       WHERE u.platform_role = 'super_admin'
         AND bm.role = 'owner'
         AND bm.status = 'active'
         AND b.status = 'active'
       LIMIT 1`
    )).rows[0];
    assert.ok(owner);
    await client.query(
      "UPDATE users SET username = $1, email = $2, password_hash = $3 WHERE id = $4",
      ["archive_owner", "archive-owner@example.test", passwordHash, owner.id]
    );
    const category = (await client.query(
      "INSERT INTO categories(name, description, business_id) VALUES($1, $2, $3) RETURNING id",
      ["Categoría archivado", "Categoría de archivado", owner.business_id]
    )).rows[0];
    const location = (await client.query(
      "SELECT id FROM business_locations WHERE business_id = $1 AND status = 'active' ORDER BY id LIMIT 1",
      [owner.business_id]
    )).rows[0];
    const product = (await client.query(
      `INSERT INTO items(sku, name, description, brand, price, stock, category_id, business_id, status)
       VALUES($1, $2, $3, $4, $5, $6, $7, $8, 'active') RETURNING id`,
      ["ARCH-001", "Producto para archivar", "Descripción de archivado", "Marca", 15, 4, category.id, owner.business_id]
    )).rows[0];
    await client.query(
      "INSERT INTO inventory_balances(business_id, location_id, item_id, stock) VALUES($1, $2, $3, $4)",
      [owner.business_id, location.id, product.id, 4]
    );
    await client.query(
      `INSERT INTO inventory_movements(business_id, location_id, item_id, movement_type, quantity_delta, previous_stock, resulting_stock, reason, created_by)
       VALUES($1, $2, $3, 'opening_balance', 4, 0, 4, $4, $5)`,
      [owner.business_id, location.id, product.id, "Saldo inicial para archivado", owner.id]
    );
    const protectedProduct = (await client.query(
      `INSERT INTO items(sku, name, description, brand, price, stock, category_id, business_id, status)
       VALUES($1, $2, $3, $4, $5, $6, $7, $8, 'active') RETURNING id`,
      ["ARCH-002", "Producto protegido", "Descripción protegida", "Marca", 8, 0, category.id, owner.business_id]
    )).rows[0];
    const manager = (await client.query(
      "INSERT INTO users(username, email, password_hash, platform_role) VALUES($1, $2, $3, 'user') RETURNING id",
      ["archive_manager", "archive-manager@example.test", passwordHash]
    )).rows[0];
    const viewer = (await client.query(
      "INSERT INTO users(username, email, password_hash, platform_role) VALUES($1, $2, $3, 'user') RETURNING id",
      ["archive_viewer", "archive-viewer@example.test", passwordHash]
    )).rows[0];
    await client.query(
      `INSERT INTO business_members(business_id, user_id, role, status)
       VALUES($1, $2, 'manager', 'active'), ($1, $3, 'viewer', 'active')`,
      [owner.business_id, manager.id, viewer.id]
    );
    const foreignUser = (await client.query(
      "INSERT INTO users(username, email, password_hash, platform_role) VALUES($1, $2, $3, 'user') RETURNING id",
      ["archive_foreign", "archive-foreign@example.test", passwordHash]
    )).rows[0];
    const foreignBusiness = (await client.query(
      "INSERT INTO businesses(name, slug, created_by, status) VALUES($1, $2, $3, 'active') RETURNING id",
      ["Negocio ajeno archivado", "negocio-ajeno-archivado", foreignUser.id]
    )).rows[0];
    await client.query("INSERT INTO business_members(business_id, user_id, role, status) VALUES($1, $2, 'owner', 'active')", [foreignBusiness.id, foreignUser.id]);
    const foreignCategory = (await client.query("INSERT INTO categories(name, description, business_id) VALUES($1, $2, $3) RETURNING id", ["Categoría ajena", "Categoría", foreignBusiness.id])).rows[0];
    const foreignProduct = (await client.query(
      `INSERT INTO items(sku, name, description, brand, price, stock, category_id, business_id, status)
       VALUES($1, $2, $3, $4, $5, $6, $7, $8, 'active') RETURNING id`,
      ["FOREIGN-ARCH", "Producto ajeno", "Descripción ajena", "Marca", 1, 0, foreignCategory.id, foreignBusiness.id]
    )).rows[0];

    const { default: app } = await import("../app.js");
    const { default: importedPool } = await import("../db/pool.js");
    pool = importedPool;
    const ownerAgent = await login(app, "archive_owner", password);

    await t.test("owner archiva con motivo válido y conserva SKU, stock, balances y movimientos", async () => {
      const before = await client.query(
        `SELECT i.sku, i.stock, b.stock AS balance_stock,
                (SELECT COUNT(*)::INTEGER FROM inventory_movements WHERE item_id = i.id AND business_id = i.business_id) AS movement_count
         FROM items i
         INNER JOIN inventory_balances b ON (b.business_id, b.item_id) = (i.business_id, i.id)
         WHERE i.id = $1 AND i.business_id = $2`,
        [product.id, owner.business_id]
      );
      const token = await csrfToken(ownerAgent);
      const response = await ownerAgent
        .post(`/api/products/${product.id}/archive`)
        .set("x-csrf-token", token)
        .send({ reason: "Producto descontinuado por el proveedor." })
        .expect(200)
        .expect("Cache-Control", "no-store");

      assert.equal(response.body.data.product.id, product.id);
      assert.equal(response.body.data.product.status, "archived");
      assert.ok(new Date(response.body.data.product.archivedAt).getTime());
      const after = await client.query(
        `SELECT i.sku, i.stock, i.status, i.archive_reason, b.stock AS balance_stock,
                (SELECT COUNT(*)::INTEGER FROM inventory_movements WHERE item_id = i.id AND business_id = i.business_id) AS movement_count
         FROM items i
         INNER JOIN inventory_balances b ON (b.business_id, b.item_id) = (i.business_id, i.id)
         WHERE i.id = $1 AND i.business_id = $2`,
        [product.id, owner.business_id]
      );
      assert.equal(after.rows[0].status, "archived");
      assert.equal(after.rows[0].archive_reason, "Producto descontinuado por el proveedor.");
      assert.deepEqual(
        { sku: after.rows[0].sku, stock: after.rows[0].stock, balance_stock: after.rows[0].balance_stock, movement_count: after.rows[0].movement_count },
        before.rows[0]
      );
    });

    await t.test("manager y viewer reciben 403 sin modificar el producto", async () => {
      for (const identifier of ["archive_manager", "archive_viewer"]) {
        const agent = await login(app, identifier, password);
        const token = await csrfToken(agent);
        const response = await agent
          .post(`/api/products/${protectedProduct.id}/archive`)
          .set("x-csrf-token", token)
          .send({ reason: "Intento sin permisos." })
          .expect(403);
        assert.equal(response.body.error.code, "FORBIDDEN");
      }
      const stored = await client.query("SELECT status, archived_at FROM items WHERE id = $1", [protectedProduct.id]);
      assert.deepEqual(stored.rows[0], { status: "active", archived_at: null });
    });

    await t.test("producto ajeno, ya archivado o motivo inválido fallan sin cambios parciales", async () => {
      let token = await csrfToken(ownerAgent);
      const foreignResponse = await ownerAgent
        .post(`/api/products/${foreignProduct.id}/archive`)
        .set("x-csrf-token", token)
        .send({ reason: "No debe revelarse el producto ajeno." })
        .expect(404);
      assert.equal(foreignResponse.body.error.code, "PRODUCT_NOT_FOUND");

      token = await csrfToken(ownerAgent);
      const repeatedResponse = await ownerAgent
        .post(`/api/products/${product.id}/archive`)
        .set("x-csrf-token", token)
        .send({ reason: "Segundo intento de archivado." })
        .expect(404);
      assert.equal(repeatedResponse.body.error.code, "PRODUCT_NOT_FOUND");

      token = await csrfToken(ownerAgent);
      const invalidReasonResponse = await ownerAgent
        .post(`/api/products/${protectedProduct.id}/archive`)
        .set("x-csrf-token", token)
        .send({ reason: "x" })
        .expect(400);
      assert.equal(invalidReasonResponse.body.error.code, "VALIDATION_ERROR");
      assert.equal(invalidReasonResponse.body.error.fields[0].field, "reason");

      const stored = await client.query("SELECT status, archived_at FROM items WHERE id = $1", [protectedProduct.id]);
      assert.deepEqual(stored.rows[0], { status: "active", archived_at: null });
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
