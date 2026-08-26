import test from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcrypt";
import pg from "pg";
import request from "supertest";
import { createTestDatabase, dropTestDatabase } from "./helpers/testDatabase.js";

const { Client } = pg;
const enabled = Boolean(process.env.TEST_DATABASE_URL);
const original = { NODE_ENV: process.env.NODE_ENV, SESSION_SECRET: process.env.SESSION_SECRET, DATABASE_URL: process.env.DATABASE_URL };
const restore = () => Object.entries(original).forEach(([key, value]) => value === undefined ? delete process.env[key] : process.env[key] = value);
async function csrf(agent) {
  const response = await agent.get("/api/csrf-token").expect(200);
  return response.body.data.csrfToken;
}

async function login(app, id, password) {
  const agent = request.agent(app);
  const token = await csrf(agent);
  await agent.post("/api/auth/login").set("x-csrf-token", token).send({ identifier: id, password }).expect(200);
  return agent;
}

test("GET /api/alerts/stock", { skip: !enabled }, async (t) => {
  let client; let pool; let made = false;
  try {
    process.env.NODE_ENV = "test"; process.env.SESSION_SECRET = "alerts-test-secret";
    await createTestDatabase(); made = true; process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    client = new Client({ connectionString: process.env.TEST_DATABASE_URL }); await client.connect();
    const password = "alerts-test-password"; const hash = await bcrypt.hash(password, 10);
    const owner = (await client.query("SELECT u.id,b.id business_id FROM users u JOIN business_members bm ON bm.user_id=u.id JOIN businesses b ON b.id=bm.business_id WHERE bm.role='owner' LIMIT 1")).rows[0];
    await client.query("UPDATE users SET username=$1,email=$2,password_hash=$3 WHERE id=$4", ["alerts_owner", "alerts-owner@test.local", hash, owner.id]);
    const manager = (await client.query("INSERT INTO users(username,email,password_hash,platform_role) VALUES('alerts_manager','alerts-manager@test.local',$1,'user') RETURNING id", [hash])).rows[0];
    const viewer = (await client.query("INSERT INTO users(username,email,password_hash,platform_role) VALUES('alerts_viewer','alerts-viewer@test.local',$1,'user') RETURNING id", [hash])).rows[0];
    await client.query("INSERT INTO business_members(business_id,user_id,role,status) VALUES($1,$2,'manager','active'),($1,$3,'viewer','active')", [owner.business_id, manager.id, viewer.id]);
    const category = (await client.query("INSERT INTO categories(name,description,business_id) VALUES('Alertas prueba','',$1) RETURNING id", [owner.business_id])).rows[0];
    const location = (await client.query("INSERT INTO business_locations(business_id,name,code,location_type,is_default) VALUES($1,'Bodega alertas','ALT','warehouse',false) RETURNING id", [owner.business_id])).rows[0];
    const addItem = async (name, sku, status = "active") => (await client.query("INSERT INTO items(name,description,brand,price,stock,category_id,business_id,sku,status,archived_at,archived_by,archive_reason) VALUES($1,'','',1,0,$2,$3,$4,$5,$6,$7,$8) RETURNING id", [name, category.id, owner.business_id, sku, status, status === "archived" ? new Date() : null, status === "archived" ? owner.id : null, status === "archived" ? "Producto archivado" : null])).rows[0];
    const out = await addItem("Sin saldo", "ALT-OUT"); const low = await addItem("Saldo bajo", "ALT-LOW"); const high = await addItem("Saldo alto", "ALT-HIGH"); const archived = await addItem("Archivado", "ALT-ARC", "archived");
    await client.query("INSERT INTO inventory_balances(business_id,location_id,item_id,stock) VALUES($1,$2,$3,2),($1,$2,$4,9)", [owner.business_id, location.id, low.id, high.id]);
    await client.query("INSERT INTO inventory_stock_thresholds(business_id,item_id,location_id,minimum_stock,created_by) VALUES($1,$2,$3,5,$4),($1,$5,$3,5,$4),($1,$6,$3,5,$4),($1,$7,$3,5,$4)", [owner.business_id, out.id, location.id, owner.id, low.id, high.id, archived.id]);
    const foreignUser = (await client.query("INSERT INTO users(username,email,password_hash,platform_role) VALUES('alerts_foreign_owner','alerts-foreign-owner@test.local',$1,'user') RETURNING id", [hash])).rows[0];
    await client.query("BEGIN");
    let foreignBusiness;
    try {
      foreignBusiness = (await client.query("INSERT INTO businesses(name,slug,created_by,status) VALUES('Ajeno alertas','ajeno-alertas',$1,'active') RETURNING id", [foreignUser.id])).rows[0];
      await client.query("INSERT INTO business_members(business_id,user_id,role,status) VALUES($1,$2,'owner','active')", [foreignBusiness.id, foreignUser.id]);
      await client.query("INSERT INTO categories(name,description,business_id,is_default) VALUES('General','Categoría predeterminada',$1,true)", [foreignBusiness.id]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
    const foreignCategory = (await client.query("INSERT INTO categories(name,description,business_id) VALUES('Categoria ajena','',$1) RETURNING id", [foreignBusiness.id])).rows[0];
    const foreignLocation = (await client.query("INSERT INTO business_locations(business_id,name,code,location_type,is_default) VALUES($1,'Bodega ajena','AJE','warehouse',true) RETURNING id", [foreignBusiness.id])).rows[0];
    const { default: app } = await import("../app.js"); const { default: importedPool } = await import("../db/pool.js"); pool = importedPool;
    const ownerAgent = await login(app, "alerts_owner", password); const managerAgent = await login(app, "alerts_manager", password); const viewerAgent = await login(app, "alerts_viewer", password);
    await t.test("alertas reales y aislamiento para los tres roles", async () => {
      for (const agent of [ownerAgent, managerAgent, viewerAgent]) {
        const response = await agent.get("/api/alerts/stock").expect(200);
        assert.deepEqual(response.body.data.alerts.map((x) => x.product.sku).sort(), ["ALT-LOW", "ALT-OUT"]);
      }
    });
    await t.test("filtros, ajenos y página inválida", async () => {
      const filtered = await ownerAgent.get(`/api/alerts/stock?q=Saldo&category=${category.id}&location=${location.id}&status=low_stock`).expect(200);
      assert.equal(filtered.body.data.pagination.totalItems, 1); assert.equal(filtered.body.data.alerts[0].product.id, low.id);
      assert.equal((await ownerAgent.get(`/api/alerts/stock?category=${foreignCategory.id}`)).body.data.alerts.length, 0);
      assert.equal((await ownerAgent.get(`/api/alerts/stock?location=${foreignLocation.id}`)).body.data.alerts.length, 0);
      assert.equal((await ownerAgent.get("/api/alerts/stock?page=-2")).body.data.pagination.page, 1);
    });
  } finally { if (client) await client.end(); if (pool) await pool.end(); if (original.DATABASE_URL === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = original.DATABASE_URL; if (made) await dropTestDatabase(); restore(); }
});
