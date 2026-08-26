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

async function createTransfer(agent, body, expectedStatus) {
  const token = await csrfToken(agent);
  return agent
    .post("/api/transfers")
    .set("x-csrf-token", token)
    .send(body)
    .expect(expectedStatus);
}

test("creación de transferencias mediante API", { skip: !hasTestDatabaseUrl }, async (t) => {
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

    const password = "api-transfer-create-password";
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
      ["transfer_owner", "transfer-owner@example.test", passwordHash, owner.id]
    );

    const manager = (await client.query(
      "INSERT INTO users(username, email, password_hash, platform_role) VALUES($1, $2, $3, 'user') RETURNING id",
      ["transfer_manager", "transfer-manager@example.test", passwordHash]
    )).rows[0];
    const viewer = (await client.query(
      "INSERT INTO users(username, email, password_hash, platform_role) VALUES($1, $2, $3, 'user') RETURNING id",
      ["transfer_viewer", "transfer-viewer@example.test", passwordHash]
    )).rows[0];
    await client.query(
      `INSERT INTO business_members(business_id, user_id, role, status)
       VALUES($1, $2, 'manager', 'active'), ($1, $3, 'viewer', 'active')`,
      [owner.business_id, manager.id, viewer.id]
    );

    const mainLocation = (await client.query(
      "SELECT id, name, code FROM business_locations WHERE business_id = $1 AND is_default AND status = 'active'",
      [owner.business_id]
    )).rows[0];
    const northLocation = (await client.query(
      `INSERT INTO business_locations(business_id, name, code, location_type, status, is_default)
       VALUES($1, $2, $3, 'warehouse', 'active', false) RETURNING id, name, code`,
      [owner.business_id, "Bodega Norte API", "NORTH-API"]
    )).rows[0];
    const inactiveLocation = (await client.query(
      `INSERT INTO business_locations(business_id, name, code, location_type, status, is_default)
       VALUES($1, $2, $3, 'warehouse', 'inactive', false) RETURNING id`,
      [owner.business_id, "Bodega inactiva API", "INACTIVE-API"]
    )).rows[0];
    const category = (await client.query(
      "INSERT INTO categories(name, description, business_id) VALUES($1, $2, $3) RETURNING id",
      ["Categoría transferencias API", "Categoría de prueba", owner.business_id]
    )).rows[0];
    const product = (await client.query(
      `INSERT INTO items(sku, name, description, brand, price, stock, category_id, business_id, status)
       VALUES($1, $2, $3, $4, $5, $6, $7, $8, 'active') RETURNING id`,
      ["TRF-API-001", "Producto para transferir", "Descripción", "Marca", 10, 8, category.id, owner.business_id]
    )).rows[0];
    const insufficientProduct = (await client.query(
      `INSERT INTO items(sku, name, description, brand, price, stock, category_id, business_id, status)
       VALUES($1, $2, $3, $4, $5, $6, $7, $8, 'active') RETURNING id`,
      ["TRF-API-002", "Producto sin stock suficiente", "Descripción", "Marca", 10, 1, category.id, owner.business_id]
    )).rows[0];
    const archivedProduct = (await client.query(
      `INSERT INTO items(sku, name, description, brand, price, stock, category_id, business_id, status, archived_at, archived_by, archive_reason)
       VALUES($1, $2, $3, $4, $5, $6, $7, $8, 'archived', clock_timestamp(), $9, $10) RETURNING id`,
      ["TRF-API-003", "Producto archivado", "Descripción", "Marca", 10, 0, category.id, owner.business_id, owner.id, "Prueba de API"]
    )).rows[0];
    await client.query(
      `INSERT INTO inventory_balances(business_id, location_id, item_id, stock)
       VALUES($1, $2, $3, 8), ($1, $2, $4, 1)`,
      [owner.business_id, mainLocation.id, product.id, insufficientProduct.id]
    );
    await client.query(
      `INSERT INTO inventory_movements(business_id, location_id, item_id, movement_type, quantity_delta, previous_stock, resulting_stock, reason, created_by)
       VALUES($1, $2, $3, 'opening_balance', 8, 0, 8, $4, $5),
             ($1, $2, $6, 'opening_balance', 1, 0, 1, $4, $5)`,
      [owner.business_id, mainLocation.id, product.id, "Saldo inicial para transferencia", owner.id, insufficientProduct.id]
    );

    const foreignUser = (await client.query(
      "INSERT INTO users(username, email, password_hash, platform_role) VALUES($1, $2, $3, 'user') RETURNING id",
      ["transfer_foreign", "transfer-foreign@example.test", passwordHash]
    )).rows[0];
    await client.query("BEGIN");
    let foreignBusiness;
    let foreignLocation;
    try {
    foreignBusiness = (await client.query(
      "INSERT INTO businesses(name, slug, created_by, status) VALUES($1, $2, $3, 'active') RETURNING id",
      ["Negocio ajeno transferencias API", "negocio-ajeno-transferencias-api", foreignUser.id]
    )).rows[0];
    await client.query(
      "INSERT INTO business_members(business_id, user_id, role, status) VALUES($1, $2, 'owner', 'active')",
      [foreignBusiness.id, foreignUser.id]
    );
    await client.query("INSERT INTO categories(business_id, name, description, is_default) VALUES($1, 'General', 'Categoría predeterminada', true)", [foreignBusiness.id]);
    foreignLocation = (await client.query(
      `INSERT INTO business_locations(business_id, name, code, location_type, status, is_default)
       VALUES($1, $2, $3, 'warehouse', 'active', false) RETURNING id`,
      [foreignBusiness.id, "Bodega ajena API", "FOREIGN-API"]
    )).rows[0];
    await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; }

    const { default: app } = await import("../app.js");
    const { default: importedPool } = await import("../db/pool.js");
    pool = importedPool;
    const ownerAgent = await login(app, "transfer_owner", password);
    const managerAgent = await login(app, "transfer_manager", password);

    await t.test("owner o manager crea dos movimientos y conserva el stock total", async () => {
      const options = await managerAgent
        .get(`/api/transfers/form-options?product=${product.id}`)
        .expect(200)
        .expect("Cache-Control", "no-store");
      assert.equal(options.body.data.selectedProductId, product.id);
      assert.ok(options.body.data.balances.some((balance) => balance.productId === product.id && balance.locationId === mainLocation.id && balance.stock === 8));

      const response = await createTransfer(managerAgent, {
        productId: product.id,
        fromLocationId: mainLocation.id,
        toLocationId: northLocation.id,
        quantity: 3,
        reason: "Reposición de la bodega norte",
        reference: ""
      }, 201);
      assert.equal(response.body.data.transfer.quantity, 3);
      assert.equal(response.body.data.transfer.reference, null);
      assert.deepEqual(response.body.data.transfer.fromLocation, { id: mainLocation.id, name: mainLocation.name, code: mainLocation.code });
      assert.deepEqual(response.body.data.transfer.toLocation, { id: northLocation.id, name: northLocation.name, code: northLocation.code });

      const stored = (await client.query(
        `SELECT
           i.stock,
           (SELECT stock FROM inventory_balances WHERE business_id = i.business_id AND item_id = i.id AND location_id = $2) AS origin_stock,
           (SELECT stock FROM inventory_balances WHERE business_id = i.business_id AND item_id = i.id AND location_id = $3) AS destination_stock,
           (SELECT COUNT(*)::INTEGER FROM inventory_transfers WHERE id = $4 AND business_id = i.business_id) AS transfer_count,
           (SELECT COUNT(*)::INTEGER FROM inventory_movements WHERE transfer_id = $4 AND business_id = i.business_id AND item_id = i.id) AS movement_count,
           (SELECT array_agg(movement_type ORDER BY movement_type) FROM inventory_movements WHERE transfer_id = $4 AND business_id = i.business_id) AS movement_types
         FROM items i WHERE i.id = $1`,
        [product.id, mainLocation.id, northLocation.id, response.body.data.transfer.id]
      )).rows[0];
      assert.deepEqual(stored, {
        stock: 8,
        origin_stock: 5,
        destination_stock: 3,
        transfer_count: 1,
        movement_count: 2,
        movement_types: ["transfer_in", "transfer_out"]
      });
    });

    await t.test("stock insuficiente revierte cabecera, movimientos y balances", async () => {
      const before = (await client.query(
        `SELECT
           (SELECT COUNT(*)::INTEGER FROM inventory_transfers WHERE business_id = $1) AS transfers,
           (SELECT COUNT(*)::INTEGER FROM inventory_movements WHERE business_id = $1 AND item_id = $2) AS movements,
           (SELECT stock FROM inventory_balances WHERE business_id = $1 AND item_id = $2 AND location_id = $3) AS origin_stock,
           (SELECT COUNT(*)::INTEGER FROM inventory_balances WHERE business_id = $1 AND item_id = $2 AND location_id = $4) AS destination_balance_rows`,
        [owner.business_id, insufficientProduct.id, mainLocation.id, northLocation.id]
      )).rows[0];
      const response = await createTransfer(ownerAgent, {
        productId: insufficientProduct.id,
        fromLocationId: mainLocation.id,
        toLocationId: northLocation.id,
        quantity: 2,
        reason: "Salida que no debe completarse",
        reference: ""
      }, 409);
      assert.equal(response.body.error.code, "INSUFFICIENT_STOCK");
      const after = (await client.query(
        `SELECT
           (SELECT COUNT(*)::INTEGER FROM inventory_transfers WHERE business_id = $1) AS transfers,
           (SELECT COUNT(*)::INTEGER FROM inventory_movements WHERE business_id = $1 AND item_id = $2) AS movements,
           (SELECT stock FROM inventory_balances WHERE business_id = $1 AND item_id = $2 AND location_id = $3) AS origin_stock,
           (SELECT COUNT(*)::INTEGER FROM inventory_balances WHERE business_id = $1 AND item_id = $2 AND location_id = $4) AS destination_balance_rows`,
        [owner.business_id, insufficientProduct.id, mainLocation.id, northLocation.id]
      )).rows[0];
      assert.deepEqual(after, before);
    });

    await t.test("origen igual, ubicación ajena o inactiva y producto archivado fallan de forma controlada", async () => {
      const sameLocation = await createTransfer(ownerAgent, {
        productId: product.id,
        fromLocationId: mainLocation.id,
        toLocationId: mainLocation.id,
        quantity: 1,
        reason: "Origen y destino iguales",
        reference: ""
      }, 400);
      assert.equal(sameLocation.body.error.code, "VALIDATION_ERROR");

      for (const locationId of [foreignLocation.id, inactiveLocation.id]) {
        const response = await createTransfer(ownerAgent, {
          productId: product.id,
          fromLocationId: mainLocation.id,
          toLocationId: locationId,
          quantity: 1,
          reason: "Ubicación no autorizada",
          reference: ""
        }, 400);
        assert.equal(response.body.error.code, "VALIDATION_ERROR");
      }

      const archived = await createTransfer(ownerAgent, {
        productId: archivedProduct.id,
        fromLocationId: mainLocation.id,
        toLocationId: northLocation.id,
        quantity: 1,
        reason: "Producto archivado no permitido",
        reference: ""
      }, 404);
      assert.equal(archived.body.error.code, "PRODUCT_NOT_FOUND");
    });

    await t.test("viewer recibe 403 y no se crea ninguna transferencia", async () => {
      const viewerAgent = await login(app, "transfer_viewer", password);
      const before = Number((await client.query("SELECT COUNT(*) FROM inventory_transfers WHERE business_id = $1", [owner.business_id])).rows[0].count);
      const response = await createTransfer(viewerAgent, {
        productId: product.id,
        fromLocationId: mainLocation.id,
        toLocationId: northLocation.id,
        quantity: 1,
        reason: "Intento sin permiso",
        reference: ""
      }, 403);
      assert.equal(response.body.error.code, "FORBIDDEN");
      const after = Number((await client.query("SELECT COUNT(*) FROM inventory_transfers WHERE business_id = $1", [owner.business_id])).rows[0].count);
      assert.equal(after, before);
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
