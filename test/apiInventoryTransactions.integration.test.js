import test from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcrypt";
import pg from "pg";
import request from "supertest";
import { createTestDatabase, dropTestDatabase, withTestTransaction } from "./helpers/testDatabase.js";

const { Client } = pg;
const available = Boolean(process.env.TEST_DATABASE_URL);
const original = { NODE_ENV: process.env.NODE_ENV, SESSION_SECRET: process.env.SESSION_SECRET, DATABASE_URL: process.env.DATABASE_URL };

function restoreEnvironment() { for (const [key, value] of Object.entries(original)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } }
async function login(app, identifier, password) { const agent = request.agent(app); const token = (await agent.get("/api/csrf-token").expect(200)).body.data.csrfToken; await agent.post("/api/auth/login").set("x-csrf-token", token).send({ identifier, password }).expect(200); return agent; }
async function createExit(agent, body, expectedStatus) { const token = (await agent.get("/api/csrf-token").expect(200)).body.data.csrfToken; return agent.post("/api/transactions/exits").set("x-csrf-token", token).send(body).expect(expectedStatus); }

test("salidas manuales de inventario mediante API", { skip: !available }, async (t) => {
  let client; let pool; let created = false;
  try {
    process.env.NODE_ENV = "test"; process.env.SESSION_SECRET = "inventory-exit-test-secret";
    await createTestDatabase(); created = true; process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    client = new Client({ connectionString: process.env.TEST_DATABASE_URL }); await client.connect();
    const password = "inventory-exit-password"; const hash = await bcrypt.hash(password, 10);
    const owner = (await client.query("SELECT u.id,b.id AS business_id FROM users u JOIN business_members bm ON bm.user_id=u.id JOIN businesses b ON b.id=bm.business_id WHERE u.platform_role='super_admin' AND bm.role='owner' AND bm.status='active' AND b.status='active' LIMIT 1")).rows[0];
    await client.query("UPDATE users SET username=$1,email=$2,password_hash=$3 WHERE id=$4", ["exit_owner", "exit-owner@example.test", hash, owner.id]);
    const category = (await client.query("INSERT INTO categories(name,description,business_id) VALUES($1,$2,$3) RETURNING id", ["Salidas", "Pruebas", owner.business_id])).rows[0];
    const location = (await client.query("SELECT id FROM business_locations WHERE business_id=$1 AND status='active' ORDER BY id LIMIT 1", [owner.business_id])).rows[0];
    const [first, second] = (await client.query("INSERT INTO items(sku,name,description,brand,price,stock,category_id,business_id,status) VALUES($1,$2,'Descripción','Marca',10,$3,$4,$5,'active'),($6,$7,'Descripción','Marca',10,$8,$4,$5,'active') RETURNING id,status", ["OUT-001", "Producto salida uno", 10, category.id, owner.business_id, "OUT-002", "Producto salida dos", 5])).rows;
    const archived = (await client.query("INSERT INTO items(sku,name,description,brand,price,stock,category_id,business_id,status,archived_at,archived_by,archive_reason) VALUES($1,$2,'Descripción','Marca',10,0,$3,$4,'archived',clock_timestamp(),$5,'Prueba') RETURNING id,status", ["OUT-ARC", "Producto archivado", category.id, owner.business_id, owner.id])).rows[0];
    await client.query("INSERT INTO inventory_balances(business_id,location_id,item_id,stock) VALUES($1,$2,$3,10),($1,$2,$4,5)", [owner.business_id, location.id, first.id, second.id]);
    const manager = (await client.query("INSERT INTO users(username,email,password_hash,platform_role) VALUES($1,$2,$3,'user') RETURNING id", ["exit_manager", "exit-manager@example.test", hash])).rows[0];
    const viewer = (await client.query("INSERT INTO users(username,email,password_hash,platform_role) VALUES($1,$2,$3,'user') RETURNING id", ["exit_viewer", "exit-viewer@example.test", hash])).rows[0];
    await client.query("INSERT INTO business_members(business_id,user_id,role,status) VALUES($1,$2,'manager','active'),($1,$3,'viewer','active')", [owner.business_id, manager.id, viewer.id]);
    const foreign = await withTestTransaction(client, async () => {
      const user = (await client.query("INSERT INTO users(username,email,password_hash,platform_role) VALUES($1,$2,$3,'user') RETURNING id", ["exit_foreign", "exit-foreign@example.test", hash])).rows[0];
      const business = (await client.query("INSERT INTO businesses(name,slug,created_by,status) VALUES($1,$2,$3,'active') RETURNING id", ["Negocio ajeno salida", "negocio-ajeno-salida", user.id])).rows[0];
      await client.query("INSERT INTO business_members(business_id,user_id,role,status) VALUES($1,$2,'owner','active')", [business.id, user.id]);
      await client.query("INSERT INTO categories(business_id,name,description,is_default) VALUES($1,'General','Categoría predeterminada',true)", [business.id]);
      const foreignLocation = (await client.query("INSERT INTO business_locations(business_id,name,code,location_type,status,is_default) VALUES($1,'Ubicación ajena','AJENA','warehouse','active',false) RETURNING id", [business.id])).rows[0];
      return { locationId: foreignLocation.id };
    });
    const { default: app } = await import("../app.js"); const { default: importedPool } = await import("../db/pool.js"); pool = importedPool;
    const ownerAgent = await login(app, "exit_owner", password);

    await t.test("owner registra varias líneas, actualiza stock y deja auditoría", async () => {
      const response = await createExit(ownerAgent, { date: "2026-08-30", locationId: location.id, reason: "Consumo interno", notes: "Uso de operación", lines: [{ itemId: first.id, quantity: 2 }, { itemId: second.id, quantity: 3 }] }, 201);
      assert.match(response.body.data.transaction.reference, /^OUT-/);
      const reference = response.body.data.transaction.reference;
      const balances = (await client.query("SELECT item_id,stock FROM inventory_balances WHERE business_id=$1 AND location_id=$2 AND item_id=ANY($3::INTEGER[]) ORDER BY item_id", [owner.business_id, location.id, [first.id, second.id]])).rows;
      assert.deepEqual(balances.map((row) => Number(row.stock)), [8, 2]);
      const movements = await client.query("SELECT movement_type,quantity_delta,reference FROM inventory_movements WHERE business_id=$1 AND reference=$2 ORDER BY id", [owner.business_id, reference]);
      assert.equal(movements.rowCount, 2); assert.ok(movements.rows.every((row) => row.movement_type === "exit" && Number(row.quantity_delta) < 0));
      const audit = await client.query("SELECT description FROM audit_log WHERE business_id=$1 AND reference=$2", [owner.business_id, reference]);
      assert.equal(audit.rowCount, 1); assert.match(audit.rows[0].description, /Salida manual/);
      const history = await ownerAgent.get(`/api/transactions?type=exit&q=${encodeURIComponent(reference)}`).expect(200);
      assert.equal(history.body.data.pagination.totalItems, 2);
    });

    await t.test("stock insuficiente, producto archivado y ubicación ajena no dejan cambios", async () => {
      const before = await client.query("SELECT COUNT(*)::INTEGER AS count FROM inventory_movements WHERE business_id=$1", [owner.business_id]);
      const insufficient = await createExit(ownerAgent, { locationId: location.id, reason: "Entrega", lines: [{ itemId: first.id, quantity: 99 }] }, 409);
      assert.equal(insufficient.body.error.code, "INSUFFICIENT_STOCK");
      const inactive = await createExit(ownerAgent, { locationId: location.id, reason: "Entrega", lines: [{ itemId: archived.id, quantity: 1 }] }, 409);
      assert.equal(inactive.body.error.code, "PRODUCT_INACTIVE");
      await createExit(ownerAgent, { locationId: foreign.locationId, reason: "Entrega", lines: [{ itemId: first.id, quantity: 1 }] }, 400);
      const after = await client.query("SELECT COUNT(*)::INTEGER AS count FROM inventory_movements WHERE business_id=$1", [owner.business_id]);
      assert.equal(after.rows[0].count, before.rows[0].count);
    });

    await t.test("manager puede registrar y viewer es solo consulta", async () => {
      const managerAgent = await login(app, "exit_manager", password);
      await createExit(managerAgent, { locationId: location.id, reason: "Muestra o cortesía", lines: [{ itemId: first.id, quantity: 1 }] }, 201);
      const viewerAgent = await login(app, "exit_viewer", password);
      const denied = await createExit(viewerAgent, { locationId: location.id, reason: "Entrega", lines: [{ itemId: first.id, quantity: 1 }] }, 403);
      assert.equal(denied.body.error.code, "FORBIDDEN");
      await viewerAgent.get("/api/transactions?type=exit").expect(200);
    });
  } finally {
    if (client) await client.end(); if (pool) await pool.end();
    if (original.DATABASE_URL === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = original.DATABASE_URL;
    if (created) await dropTestDatabase(); restoreEnvironment();
  }
});
