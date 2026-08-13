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

test("listado y detalle de transferencias mediante API", { skip: !hasTestDatabaseUrl }, async (t) => {
  let client;
  let pool;
  let createInventoryTransfer;
  let databaseCreated = false;

  try {
    process.env.NODE_ENV = "test";
    process.env.SESSION_SECRET = "integration-test-secret";
    await createTestDatabase();
    databaseCreated = true;
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    client = new Client({ connectionString: process.env.TEST_DATABASE_URL });
    await client.connect();

    const password = "api-transfer-list-password";
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
      ["transfer_list_owner", "transfer-list-owner@example.test", passwordHash, owner.id]
    );
    const manager = (await client.query(
      "INSERT INTO users(username, email, password_hash, platform_role) VALUES($1, $2, $3, 'user') RETURNING id",
      ["transfer_list_manager", "transfer-list-manager@example.test", passwordHash]
    )).rows[0];
    const viewer = (await client.query(
      "INSERT INTO users(username, email, password_hash, platform_role) VALUES($1, $2, $3, 'user') RETURNING id",
      ["transfer_list_viewer", "transfer-list-viewer@example.test", passwordHash]
    )).rows[0];
    await client.query(
      `INSERT INTO business_members(business_id, user_id, role, status)
       VALUES($1, $2, 'manager', 'active'), ($1, $3, 'viewer', 'active')`,
      [owner.business_id, manager.id, viewer.id]
    );

    const mainLocation = (await client.query(
      "SELECT id FROM business_locations WHERE business_id = $1 AND is_default AND status = 'active'",
      [owner.business_id]
    )).rows[0];
    const northLocation = (await client.query(
      `INSERT INTO business_locations(business_id, name, code, location_type, status, is_default)
       VALUES($1, $2, $3, 'warehouse', 'active', false) RETURNING id`,
      [owner.business_id, "Bodega Norte listado", "NORTH-LIST"]
    )).rows[0];
    const category = (await client.query(
      "INSERT INTO categories(name, description, business_id) VALUES($1, $2, $3) RETURNING id",
      ["Categoría listado transferencias", "Categoría de prueba", owner.business_id]
    )).rows[0];
    const product = (await client.query(
      `INSERT INTO items(sku, name, description, brand, price, stock, category_id, business_id, status)
       VALUES($1, $2, $3, $4, $5, $6, $7, $8, 'active') RETURNING id`,
      ["TRF-LIST-001", "Producto listado transferencias", "Descripción", "Marca", 10, 40, category.id, owner.business_id]
    )).rows[0];
    await client.query(
      "INSERT INTO inventory_balances(business_id, location_id, item_id, stock) VALUES($1, $2, $3, 40)",
      [owner.business_id, mainLocation.id, product.id]
    );
    await client.query(
      `INSERT INTO inventory_movements(business_id, location_id, item_id, movement_type, quantity_delta, previous_stock, resulting_stock, reason, created_by)
       VALUES($1, $2, $3, 'opening_balance', 40, 0, 40, $4, $5)`,
      [owner.business_id, mainLocation.id, product.id, "Saldo inicial para listado", owner.id]
    );

    const foreignUser = (await client.query(
      "INSERT INTO users(username, email, password_hash, platform_role) VALUES($1, $2, $3, 'user') RETURNING id",
      ["transfer_list_foreign", "transfer-list-foreign@example.test", passwordHash]
    )).rows[0];
    const foreignBusiness = (await client.query(
      "INSERT INTO businesses(name, slug, created_by, status) VALUES($1, $2, $3, 'active') RETURNING id",
      ["Negocio ajeno listado", "negocio-ajeno-listado", foreignUser.id]
    )).rows[0];
    await client.query(
      "INSERT INTO business_members(business_id, user_id, role, status) VALUES($1, $2, 'owner', 'active')",
      [foreignBusiness.id, foreignUser.id]
    );
    const foreignMain = (await client.query(
      `INSERT INTO business_locations(business_id, name, code, location_type, status, is_default)
       VALUES($1, $2, $3, 'branch', 'active', true) RETURNING id`,
      [foreignBusiness.id, "Sucursal ajena principal", "MAIN-FOREIGN"]
    )).rows[0];
    const foreignNorth = (await client.query(
      `INSERT INTO business_locations(business_id, name, code, location_type, status, is_default)
       VALUES($1, $2, $3, 'warehouse', 'active', false) RETURNING id`,
      [foreignBusiness.id, "Bodega ajena listado", "FOREIGN-LIST"]
    )).rows[0];
    const foreignCategory = (await client.query(
      "INSERT INTO categories(name, description, business_id) VALUES($1, $2, $3) RETURNING id",
      ["Categoría ajena listado", "Categoría", foreignBusiness.id]
    )).rows[0];
    const foreignProduct = (await client.query(
      `INSERT INTO items(sku, name, description, brand, price, stock, category_id, business_id, status)
       VALUES($1, $2, $3, $4, $5, $6, $7, $8, 'active') RETURNING id`,
      ["FOREIGN-LIST-001", "Producto solo negocio ajeno", "Descripción", "Marca", 10, 2, foreignCategory.id, foreignBusiness.id]
    )).rows[0];
    await client.query(
      `INSERT INTO inventory_balances(business_id, location_id, item_id, stock)
       VALUES($1, $2, $3, 2)`,
      [foreignBusiness.id, foreignMain.id, foreignProduct.id]
    );
    await client.query(
      `INSERT INTO inventory_movements(business_id, location_id, item_id, movement_type, quantity_delta, previous_stock, resulting_stock, reason, created_by)
       VALUES($1, $2, $3, 'opening_balance', 2, 0, 2, $4, $5)`,
      [foreignBusiness.id, foreignMain.id, foreignProduct.id, "Saldo inicial ajeno", foreignUser.id]
    );

    ({ createInventoryTransfer } = await import("../db/transferQueries.js"));
    const createdTransfers = [];
    for (let index = 1; index <= 25; index += 1) {
      createdTransfers.push(await createInventoryTransfer({
        businessId: owner.business_id,
        itemId: product.id,
        userId: owner.id,
        fromLocationId: mainLocation.id,
        toLocationId: northLocation.id,
        quantity: 1,
        reason: `Reposición de listado ${index}`,
        reference: `REF-LIST-${String(index).padStart(2, "0")}`
      }));
    }
    const foreignTransfer = await createInventoryTransfer({
      businessId: foreignBusiness.id,
      itemId: foreignProduct.id,
      userId: foreignUser.id,
      fromLocationId: foreignMain.id,
      toLocationId: foreignNorth.id,
      quantity: 1,
      reason: "Transferencia exclusiva de otro negocio",
      reference: "REF-FOREIGN"
    });

    const { default: app } = await import("../app.js");
    const { default: importedPool } = await import("../db/pool.js");
    pool = importedPool;
    const ownerAgent = await login(app, "transfer_list_owner", password);
    const managerAgent = await login(app, "transfer_list_manager", password);
    const viewerAgent = await login(app, "transfer_list_viewer", password);

    await t.test("owner, manager y viewer ven únicamente transferencias del negocio activo", async () => {
      for (const agent of [ownerAgent, managerAgent, viewerAgent]) {
        const response = await agent.get("/api/transfers").expect(200).expect("Cache-Control", "no-store");
        assert.equal(response.body.data.pagination.totalItems, 25);
        assert.equal(response.body.data.transfers.some((transfer) => transfer.product.sku === "FOREIGN-LIST-001"), false);
      }
    });

    await t.test("búsqueda, ubicación y paginación comparten conteo y resultados", async () => {
      const search = await ownerAgent.get("/api/transfers?q=REF-LIST-07").expect(200);
      assert.equal(search.body.data.pagination.totalItems, 1);
      assert.equal(search.body.data.transfers[0].reference, "REF-LIST-07");

      const byLocation = await ownerAgent.get(`/api/transfers?location=${northLocation.id}&page=2`).expect(200);
      assert.equal(byLocation.body.data.pagination.totalItems, 25);
      assert.equal(byLocation.body.data.pagination.page, 2);
      assert.equal(byLocation.body.data.transfers.length, 5);
      assert.ok(byLocation.body.data.transfers.every((transfer) => transfer.toLocation.id === northLocation.id));

      const foreignLocation = await ownerAgent.get(`/api/transfers?location=${foreignNorth.id}`).expect(200);
      assert.equal(foreignLocation.body.data.pagination.totalItems, 0);
      assert.deepEqual(foreignLocation.body.data.transfers, []);
    });

    await t.test("detalle propio tiene salida y entrada; ajeno e ID inválido no se revelan", async () => {
      const own = await viewerAgent.get(`/api/transfers/${createdTransfers[0].id}`).expect(200);
      assert.equal(own.body.data.transfer.transferOut.type, "transfer_out");
      assert.equal(own.body.data.transfer.transferIn.type, "transfer_in");
      assert.equal(own.body.data.transfer.transferOut.quantityDelta, -1);
      assert.equal(own.body.data.transfer.transferIn.quantityDelta, 1);

      const foreign = await viewerAgent.get(`/api/transfers/${foreignTransfer.id}`).expect(404);
      assert.equal(foreign.body.error.code, "TRANSFER_NOT_FOUND");
      const invalid = await viewerAgent.get("/api/transfers/1.5").expect(400);
      assert.equal(invalid.body.error.code, "VALIDATION_ERROR");
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
