import test from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcrypt";
import pg from "pg";
import request from "supertest";
import { createTestDatabase, dropTestDatabase } from "./helpers/testDatabase.js";

const { Client } = pg;
const hasTestDatabaseUrl = Boolean(process.env.TEST_DATABASE_URL);
const original = { NODE_ENV: process.env.NODE_ENV, SESSION_SECRET: process.env.SESSION_SECRET, DATABASE_URL: process.env.DATABASE_URL };
function restoreEnvironment() { for (const [key, value] of Object.entries(original)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } }
async function login(app, identifier, password) { const agent = request.agent(app); const csrf = (await agent.get("/api/csrf-token")).body.data.csrfToken; await agent.post("/api/auth/login").set("x-csrf-token", csrf).send({ identifier, password }).expect(200); return agent; }
async function csrf(agent) { return (await agent.get("/api/csrf-token")).body.data.csrfToken; }

test("productos archivados mediante API", { skip: !hasTestDatabaseUrl }, async (t) => {
  let client; let pool; let created = false;
  try {
    process.env.NODE_ENV = "test"; process.env.SESSION_SECRET = "integration-test-secret";
    await createTestDatabase(); created = true; process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    client = new Client({ connectionString: process.env.TEST_DATABASE_URL }); await client.connect();
    const password = "archived-products-password"; const hash = await bcrypt.hash(password, 10);
    const owner = (await client.query(`SELECT u.id,b.id business_id FROM users u JOIN business_members bm ON bm.user_id=u.id JOIN businesses b ON b.id=bm.business_id WHERE u.platform_role='super_admin' AND bm.role='owner' AND bm.status='active' AND b.status='active' LIMIT 1`)).rows[0];
    await client.query("UPDATE users SET username=$1,email=$2,password_hash=$3 WHERE id=$4", ["archived_owner", "archived-owner@example.test", hash, owner.id]);
    const category = (await client.query("INSERT INTO categories(name,description,business_id) VALUES($1,$2,$3) RETURNING id", ["Categoría archivada", "Categoría", owner.business_id])).rows[0];
    const location = (await client.query("SELECT id FROM business_locations WHERE business_id=$1 AND status='active' LIMIT 1", [owner.business_id])).rows[0];
    const archived = (await client.query(`INSERT INTO items(sku,name,description,brand,price,stock,category_id,business_id,status,archived_at,archived_by,archive_reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'archived',clock_timestamp(),$9,$10) RETURNING id`, ["ARC-001", "Archivado propio", "Descripción archivada", "Marca", 12, 5, category.id, owner.business_id, owner.id, "Producto descontinuado"])).rows[0];
    await client.query("INSERT INTO inventory_balances(business_id,location_id,item_id,stock) VALUES($1,$2,$3,5)", [owner.business_id, location.id, archived.id]);
    await client.query("INSERT INTO inventory_movements(business_id,location_id,item_id,movement_type,quantity_delta,previous_stock,resulting_stock,reason,created_by) VALUES($1,$2,$3,'opening_balance',5,0,5,$4,$5)", [owner.business_id, location.id, archived.id, "Saldo archivado", owner.id]);
    const active = (await client.query(`INSERT INTO items(sku,name,description,brand,price,stock,category_id,business_id,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'active') RETURNING id`, ["ACT-001", "Activo propio", "Descripción activa", "Marca", 2, 0, category.id, owner.business_id])).rows[0];
    const manager = (await client.query("INSERT INTO users(username,email,password_hash,platform_role) VALUES($1,$2,$3,'user') RETURNING id", ["archived_manager", "archived-manager@example.test", hash])).rows[0];
    const viewer = (await client.query("INSERT INTO users(username,email,password_hash,platform_role) VALUES($1,$2,$3,'user') RETURNING id", ["archived_viewer", "archived-viewer@example.test", hash])).rows[0];
    await client.query("INSERT INTO business_members(business_id,user_id,role,status) VALUES($1,$2,'manager','active'),($1,$3,'viewer','active')", [owner.business_id, manager.id, viewer.id]);
    const foreignUser = (await client.query("INSERT INTO users(username,email,password_hash,platform_role) VALUES($1,$2,$3,'user') RETURNING id", ["archived_foreign", "archived-foreign@example.test", hash])).rows[0];
    await client.query("BEGIN");
    let foreignBusiness; let foreignCategory; let foreign;
    try {
    foreignBusiness = (await client.query("INSERT INTO businesses(name,slug,created_by,status) VALUES($1,$2,$3,'active') RETURNING id", ["Negocio ajeno archivados", "negocio-ajeno-archivados", foreignUser.id])).rows[0];
    await client.query("INSERT INTO business_members(business_id,user_id,role,status) VALUES($1,$2,'owner','active')", [foreignBusiness.id, foreignUser.id]);
    await client.query("INSERT INTO categories(business_id,name,description,is_default) VALUES($1,'General','Categoría predeterminada',true)", [foreignBusiness.id]);
    foreignCategory = (await client.query("INSERT INTO categories(name,description,business_id) VALUES($1,$2,$3) RETURNING id", ["Categoría ajena", "Categoría", foreignBusiness.id])).rows[0];
    foreign = (await client.query(`INSERT INTO items(sku,name,description,brand,price,stock,category_id,business_id,status,archived_at,archived_by,archive_reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'archived',clock_timestamp(),$9,$10) RETURNING id`, ["ARC-FOREIGN", "Archivado ajeno", "Descripción", "Marca", 1, 0, foreignCategory.id, foreignBusiness.id, foreignUser.id, "Ajeno"])).rows[0];
    await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    const { default: app } = await import("../app.js"); const { default: importedPool } = await import("../db/pool.js"); pool = importedPool;
    const ownerAgent = await login(app, "archived_owner", password);
    await t.test("owner lista y consulta solo archivados de su negocio", async () => {
      const list = await ownerAgent.get("/api/products/archived").expect(200).expect("Cache-Control", "no-store");
      assert.equal(list.body.data.pagination.totalItems, 1); assert.equal(list.body.data.products[0].id, archived.id); assert.equal(JSON.stringify(list.body).includes("ARC-FOREIGN"), false);
      const details = await ownerAgent.get(`/api/products/${archived.id}/archived`).expect(200); assert.equal(details.body.data.product.archiveReason, "Producto descontinuado"); assert.equal(details.body.data.balances[0].stock, 5); assert.equal(details.body.data.recentMovements.length, 1);
    });
    await t.test("manager/viewer reciben 403 y productos ajeno o activo dan 404", async () => {
      for (const identifier of ["archived_manager", "archived_viewer"]) { const agent = await login(app, identifier, password); const response = await agent.get("/api/products/archived").expect(403); assert.equal(response.body.error.code, "FORBIDDEN"); }
      for (const id of [foreign.id, active.id]) { const response = await ownerAgent.get(`/api/products/${id}/archived`).expect(404); assert.equal(response.body.error.code, "PRODUCT_NOT_FOUND"); }
    });
    await t.test("owner restaura conservando datos y limpiando metadatos", async () => {
      const before = (await client.query("SELECT sku,stock FROM items WHERE id=$1", [archived.id])).rows[0]; const token = await csrf(ownerAgent);
      const response = await ownerAgent.post(`/api/products/${archived.id}/restore`).set("x-csrf-token", token).send({}).expect(200); assert.deepEqual(response.body.data.product, { id: archived.id, status: "active" });
      const after = (await client.query(`SELECT sku,stock,status,archived_at,archived_by,archive_reason,(SELECT COUNT(*)::INTEGER FROM inventory_balances WHERE item_id=$1) balances,(SELECT COUNT(*)::INTEGER FROM inventory_movements WHERE item_id=$1) movements FROM items WHERE id=$1`, [archived.id])).rows[0];
      assert.equal(after.sku, before.sku); assert.equal(after.stock, before.stock); assert.equal(after.status, "active"); assert.equal(after.archived_at, null); assert.equal(after.archived_by, null); assert.equal(after.archive_reason, null); assert.equal(after.balances, 1); assert.equal(after.movements, 1);
    });
  } finally { if (client) await client.end(); if (pool) await pool.end(); if (original.DATABASE_URL === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = original.DATABASE_URL; if (created) await dropTestDatabase(); restoreEnvironment(); }
});
