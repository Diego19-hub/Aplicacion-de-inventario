import test from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcrypt";
import pg from "pg";
import request from "supertest";
import { createTestDatabase, dropTestDatabase, withTestTransaction } from "./helpers/testDatabase.js";

const { Client } = pg;
const hasTestDatabaseUrl = Boolean(process.env.TEST_DATABASE_URL);
const originalEnvironment = { NODE_ENV: process.env.NODE_ENV, SESSION_SECRET: process.env.SESSION_SECRET, DATABASE_URL: process.env.DATABASE_URL };

function restoreEnvironment() {
  for (const [name, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) delete process.env[name]; else process.env[name] = value;
  }
}

async function login(app, identifier, password) {
  const agent = request.agent(app);
  const token = (await agent.get("/api/csrf-token").expect(200)).body.data.csrfToken;
  await agent.post("/api/auth/login").set("x-csrf-token", token).send({ identifier, password }).expect(200);
  return agent;
}

test("GET /api/products/:productId", { skip: !hasTestDatabaseUrl }, async (t) => {
  let client; let pool; let databaseCreated = false;
  try {
    process.env.NODE_ENV = "test";
    process.env.SESSION_SECRET = "integration-test-secret";
    await createTestDatabase(); databaseCreated = true;
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    client = new Client({ connectionString: process.env.TEST_DATABASE_URL }); await client.connect();
    const password = "api-product-detail-password";
    const hash = await bcrypt.hash(password, 10);
    const ownerResult = await client.query("SELECT u.id,b.id business_id FROM users u JOIN business_members bm ON bm.user_id=u.id JOIN businesses b ON b.id=bm.business_id WHERE u.platform_role='super_admin' AND bm.role='owner' AND bm.status='active' AND b.status='active' LIMIT 1");
    const owner = ownerResult.rows[0];
    await client.query("UPDATE users SET username=$1,email=$2,password_hash=$3 WHERE id=$4", ["detail_owner", "detail-owner@example.test", hash, owner.id]);
    const activeLocation = (await client.query("SELECT id FROM business_locations WHERE business_id=$1 AND status='active' LIMIT 1", [owner.business_id])).rows[0];
    const inactiveLocation = (await client.query("INSERT INTO business_locations(business_id,name,code,location_type,status,is_default) VALUES($1,$2,$3,'warehouse','inactive',false) RETURNING id", [owner.business_id, "Bodega histórica", "HIST"])).rows[0];
    const category = (await client.query("INSERT INTO categories(name,description,business_id) VALUES($1,$2,$3) RETURNING id", ["Categoría detalle", "Categoría", owner.business_id])).rows[0];
    const product = (await client.query("INSERT INTO items(sku,name,description,brand,price,stock,category_id,business_id,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'active') RETURNING id", ["DET-001", "Producto detalle", "Descripción de detalle", "Marca", 15, 5, category.id, owner.business_id])).rows[0];
    await client.query("INSERT INTO inventory_balances(business_id,location_id,item_id,stock) VALUES($1,$2,$3,3),($1,$4,$3,2)", [owner.business_id, activeLocation.id, product.id, inactiveLocation.id]);
    await client.query("INSERT INTO inventory_stock_thresholds(business_id,item_id,location_id,minimum_stock,created_by) VALUES($1,$2,$3,3,$4)", [owner.business_id, product.id, activeLocation.id, owner.id]);
    await client.query("INSERT INTO inventory_movements(business_id,location_id,item_id,movement_type,quantity_delta,previous_stock,resulting_stock,reason,created_by) VALUES($1,$2,$3,'opening_balance',3,0,3,$4,$5),($1,$6,$3,'opening_balance',2,0,2,$7,$5)", [owner.business_id, activeLocation.id, product.id, "Saldo inicial activo", owner.id, inactiveLocation.id, "Saldo inicial histórico"]);
    const archived = (await client.query("INSERT INTO items(sku,name,description,brand,price,stock,category_id,business_id,status,archived_at,archived_by,archive_reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'archived',clock_timestamp(),$9,$10) RETURNING id", ["DET-ARC", "Producto archivado", "Descripción", "Marca", 10, 0, category.id, owner.business_id, owner.id, "Archivado para prueba"])).rows[0];
    const foreignUser = (await client.query("INSERT INTO users(username,email,password_hash,platform_role) VALUES($1,$2,$3,'user') RETURNING id", ["detail_foreign", "detail-foreign@example.test", hash])).rows[0];
    const foreignBusiness = await withTestTransaction(client, async () => {
      const business = (await client.query("INSERT INTO businesses(name,slug,created_by,status) VALUES($1,$2,$3,'active') RETURNING id", ["Negocio ajeno detalle", "negocio-ajeno-detalle", foreignUser.id])).rows[0];
      await client.query("INSERT INTO business_members(business_id,user_id,role,status) VALUES($1,$2,'owner','active')", [business.id, foreignUser.id]);
      await client.query("INSERT INTO categories(business_id,name,description,is_default) VALUES($1,'General','Categoría predeterminada',true)", [business.id]);
      return business;
    });
    const foreignCategory = (await client.query("INSERT INTO categories(name,description,business_id) VALUES($1,$2,$3) RETURNING id", ["Categoría ajena detalle", "Categoría", foreignBusiness.id])).rows[0];
    const foreignProduct = (await client.query("INSERT INTO items(sku,name,description,brand,price,stock,category_id,business_id,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'active') RETURNING id", ["DET-FOREIGN", "Producto ajeno detalle", "Descripción", "Marca", 1, 0, foreignCategory.id, foreignBusiness.id])).rows[0];
    const { default: app } = await import("../app.js"); const { default: importedPool } = await import("../db/pool.js"); pool = importedPool;
    const agent = await login(app, "detail_owner", password);
    await t.test("devuelve producto, balances y movimientos aislados", async () => {
      const response = await agent.get(`/api/products/${product.id}`).expect(200).expect("Cache-Control", "no-store");
      assert.equal(response.body.data.product.stock, 5);
      assert.equal(response.body.data.balances.length, 2);
      assert.deepEqual(response.body.data.balances.map((balance) => balance.stock), [3, 2]);
      assert.equal(response.body.data.balances[0].alertStatus, "low_stock");
      assert.equal(response.body.data.balances[1].location.status, "inactive");
      assert.equal(response.body.data.recentMovements.length, 2);
      assert.equal(JSON.stringify(response.body).includes("Producto ajeno detalle"), false);
    });
    await t.test("producto ajeno o archivado responde 404", async () => {
      for (const id of [foreignProduct.id, archived.id]) {
        const response = await agent.get(`/api/products/${id}`).expect(404);
        assert.equal(response.body.error.code, "PRODUCT_NOT_FOUND");
      }
    });
    await t.test("ID inválido responde 400", async () => {
      const response = await agent.get("/api/products/1.5").expect(400);
      assert.equal(response.body.error.code, "VALIDATION_ERROR");
    });
  } finally {
    if (client) await client.end(); if (pool) await pool.end();
    if (originalEnvironment.DATABASE_URL === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = originalEnvironment.DATABASE_URL;
    if (databaseCreated) await dropTestDatabase(); restoreEnvironment();
  }
});
