import test from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcrypt";
import pg from "pg";
import request from "supertest";
import { createTestDatabase, dropTestDatabase } from "./helpers/testDatabase.js";

const { Client } = pg;
const available = Boolean(process.env.TEST_DATABASE_URL);
const original = { NODE_ENV: process.env.NODE_ENV, SESSION_SECRET: process.env.SESSION_SECRET, DATABASE_URL: process.env.DATABASE_URL };
function restoreEnvironment() { for (const [key, value] of Object.entries(original)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } }
async function login(app, identifier, password) { const agent = request.agent(app); const token = (await agent.get("/api/csrf-token")).body.data.csrfToken; await agent.post("/api/auth/login").set("x-csrf-token", token).send({ identifier, password }).expect(200); return agent; }
async function csrf(agent) { return (await agent.get("/api/csrf-token")).body.data.csrfToken; }
async function createMovement(agent, productId, body, expectedStatus) {
  return agent
    .post(`/api/products/${productId}/movements`)
    .set("x-csrf-token", await csrf(agent))
    .send(body)
    .expect(expectedStatus);
}

test("registro de movimientos manuales mediante API", { skip: !available }, async (t) => {
  let client; let pool; let created = false;
  try {
    process.env.NODE_ENV = "test"; process.env.SESSION_SECRET = "integration-test-secret";
    await createTestDatabase(); created = true; process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    client = new Client({ connectionString: process.env.TEST_DATABASE_URL }); await client.connect();
    const password = "api-movement-create-password"; const hash = await bcrypt.hash(password, 10);
    const owner = (await client.query(`SELECT u.id,b.id business_id FROM users u JOIN business_members bm ON bm.user_id=u.id JOIN businesses b ON b.id=bm.business_id WHERE u.platform_role='super_admin' AND bm.role='owner' AND bm.status='active' AND b.status='active' LIMIT 1`)).rows[0];
    await client.query("UPDATE users SET username=$1,email=$2,password_hash=$3 WHERE id=$4", ["movement_owner", "movement-owner@example.test", hash, owner.id]);
    const category = (await client.query("INSERT INTO categories(name,description,business_id) VALUES($1,$2,$3) RETURNING id", ["Categoría movimientos", "Categoría", owner.business_id])).rows[0];
    const location = (await client.query("SELECT id,name,code FROM business_locations WHERE business_id=$1 AND status='active' ORDER BY id LIMIT 1", [owner.business_id])).rows[0];
    const product = (await client.query(`INSERT INTO items(sku,name,description,brand,price,stock,category_id,business_id,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'active') RETURNING id`, ["MOV-001", "Producto movimientos", "Descripción movimientos", "Marca", 10, 0, category.id, owner.business_id])).rows[0];
    const adjustmentProduct = (await client.query(`INSERT INTO items(sku,name,description,brand,price,stock,category_id,business_id,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'active') RETURNING id`, ["MOV-ADJ", "Producto ajuste", "Descripción ajuste", "Marca", 10, 4, category.id, owner.business_id])).rows[0];
    await client.query("INSERT INTO inventory_balances(business_id,location_id,item_id,stock) VALUES($1,$2,$3,4)", [owner.business_id, location.id, adjustmentProduct.id]);
    const viewer = (await client.query("INSERT INTO users(username,email,password_hash,platform_role) VALUES($1,$2,$3,'user') RETURNING id", ["movement_viewer", "movement-viewer@example.test", hash])).rows[0];
    await client.query("INSERT INTO business_members(business_id,user_id,role,status) VALUES($1,$2,'viewer','active')", [owner.business_id, viewer.id]);
    const foreignUser = (await client.query("INSERT INTO users(username,email,password_hash,platform_role) VALUES($1,$2,$3,'user') RETURNING id", ["movement_foreign", "movement-foreign@example.test", hash])).rows[0];
    const foreignBusiness = (await client.query("INSERT INTO businesses(name,slug,created_by,status) VALUES($1,$2,$3,'active') RETURNING id", ["Negocio ajeno movimientos", "negocio-ajeno-movimientos", foreignUser.id])).rows[0];
    await client.query("INSERT INTO business_members(business_id,user_id,role,status) VALUES($1,$2,'owner','active')", [foreignBusiness.id, foreignUser.id]);
    const foreignCategory = (await client.query("INSERT INTO categories(name,description,business_id) VALUES($1,$2,$3) RETURNING id", ["Categoría ajena", "Categoría", foreignBusiness.id])).rows[0];
    const foreignProduct = (await client.query(`INSERT INTO items(sku,name,description,brand,price,stock,category_id,business_id,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'active') RETURNING id`, ["MOV-FOR", "Producto ajeno", "Descripción", "Marca", 1, 0, foreignCategory.id, foreignBusiness.id])).rows[0];
    const foreignLocation = (await client.query("INSERT INTO business_locations(business_id,name,code,location_type,status,is_default) VALUES($1,$2,$3,'warehouse','active',false) RETURNING id", [foreignBusiness.id, "Ubicación ajena", "AJENA"])).rows[0];
    const archivedProduct = (await client.query(`INSERT INTO items(sku,name,description,brand,price,stock,category_id,business_id,status,archived_at,archived_by,archive_reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'archived',clock_timestamp(),$9,$10) RETURNING id`, ["MOV-ARC", "Producto archivado", "Descripción", "Marca", 1, 0, category.id, owner.business_id, owner.id, "Prueba"])).rows[0];
    const { default: app } = await import("../app.js"); const { default: importedPool } = await import("../db/pool.js"); pool = importedPool;
    const ownerAgent = await login(app, "movement_owner", password);
    await t.test("owner registra una entrada y actualiza ledger, balance y stock", async () => {
      const options = await ownerAgent.get(`/api/products/${product.id}/movements/form-options`).expect(200); assert.equal(options.body.data.locations[0].stock, 0);
      const response = await createMovement(ownerAgent, product.id, { locationId: location.id, movementType: "entry", quantity: 5, reason: "Compra recibida", reference: "" }, 201);
      assert.equal(response.body.data.movement.quantityDelta, 5); assert.equal(response.body.data.movement.reference, null); assert.equal(response.body.data.product.stock, 5);
      const stored = (await client.query(`SELECT i.stock,(SELECT stock FROM inventory_balances WHERE business_id=i.business_id AND location_id=$2 AND item_id=i.id) balance,(SELECT COUNT(*)::INTEGER FROM inventory_movements WHERE item_id=i.id AND business_id=i.business_id) movements FROM items i WHERE i.id=$1`, [product.id, location.id])).rows[0];
      assert.deepEqual(stored, { stock: 5, balance: 5, movements: 1 });
    });
    await t.test("salida válida funciona y salida insuficiente revierte completamente", async () => {
      const valid = await createMovement(ownerAgent, product.id, { locationId: location.id, movementType: "exit", quantity: 2, reason: "Venta registrada", reference: "V-1" }, 201); assert.equal(valid.body.data.product.stock, 3);
      const before = (await client.query(`SELECT i.stock,(SELECT stock FROM inventory_balances WHERE business_id=i.business_id AND location_id=$2 AND item_id=i.id) balance,(SELECT COUNT(*)::INTEGER FROM inventory_movements WHERE item_id=i.id) movements FROM items i WHERE i.id=$1`, [product.id, location.id])).rows[0];
      const insufficient = await createMovement(ownerAgent, product.id, { locationId: location.id, movementType: "exit", quantity: 4, reason: "Salida excesiva", reference: "" }, 409); assert.equal(insufficient.body.error.code, "INSUFFICIENT_STOCK");
      const after = (await client.query(`SELECT i.stock,(SELECT stock FROM inventory_balances WHERE business_id=i.business_id AND location_id=$2 AND item_id=i.id) balance,(SELECT COUNT(*)::INTEGER FROM inventory_movements WHERE item_id=i.id) movements FROM items i WHERE i.id=$1`, [product.id, location.id])).rows[0]; assert.deepEqual(after, before);
    });
    await t.test("ajuste usa saldo local final y ajuste sin diferencia se rechaza", async () => {
      const adjusted = await createMovement(ownerAgent, adjustmentProduct.id, { locationId: location.id, movementType: "adjustment", quantity: 7, reason: "Conteo físico actualizado", reference: "" }, 201); assert.equal(adjusted.body.data.movement.quantityDelta, 3); assert.equal(adjusted.body.data.movement.resultingStock, 7); assert.equal(adjusted.body.data.product.stock, 7);
      const before = (await client.query("SELECT stock FROM items WHERE id=$1", [adjustmentProduct.id])).rows[0]; const same = await createMovement(ownerAgent, adjustmentProduct.id, { locationId: location.id, movementType: "adjustment", quantity: 7, reason: "Conteo sin cambios", reference: "" }, 400); assert.equal(same.body.error.code, "VALIDATION_ERROR"); const after = (await client.query("SELECT stock FROM items WHERE id=$1", [adjustmentProduct.id])).rows[0]; assert.deepEqual(after, before);
    });
    await t.test("viewer, producto ajeno/archivado y ubicación ajena quedan bloqueados", async () => {
      const viewerAgent = await login(app, "movement_viewer", password); const viewer = await createMovement(viewerAgent, product.id, { locationId: location.id, movementType: "entry", quantity: 1, reason: "No permitido", reference: "" }, 403); assert.equal(viewer.body.error.code, "FORBIDDEN");
      for (const id of [foreignProduct.id, archivedProduct.id]) { const response = await createMovement(ownerAgent, id, { locationId: location.id, movementType: "entry", quantity: 1, reason: "Producto no permitido", reference: "" }, 404); assert.equal(response.body.error.code, "PRODUCT_NOT_FOUND"); }
      const before = Number((await client.query("SELECT COUNT(*) FROM inventory_movements WHERE item_id=$1", [product.id])).rows[0].count); const foreignLocationResponse = await createMovement(ownerAgent, product.id, { locationId: foreignLocation.id, movementType: "entry", quantity: 1, reason: "Ubicación no permitida", reference: "" }, 400); assert.equal(foreignLocationResponse.body.error.code, "VALIDATION_ERROR"); const after = Number((await client.query("SELECT COUNT(*) FROM inventory_movements WHERE item_id=$1", [product.id])).rows[0].count); assert.equal(after, before);
    });
  } finally { if (client) await client.end(); if (pool) await pool.end(); if (original.DATABASE_URL === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = original.DATABASE_URL; if (created) await dropTestDatabase(); restoreEnvironment(); }
});
