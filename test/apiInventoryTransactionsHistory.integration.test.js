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
async function csrf(agent) { return (await agent.get("/api/csrf-token").expect(200)).body.data.csrfToken; }
async function login(app, identifier, password) { const agent = request.agent(app); await agent.post("/api/auth/login").set("x-csrf-token", await csrf(agent)).send({ identifier, password }).expect(200); return agent; }
async function create(agent, path, body) { return agent.post(path).set("x-csrf-token", await csrf(agent)).send(body).expect(201); }

test("entradas, salidas y ajustes nuevos aparecen primero en el historial del negocio activo", { skip: !available }, async () => {
  let client; let pool; let created = false;
  try {
    process.env.NODE_ENV = "test"; process.env.SESSION_SECRET = "transaction-history-test-secret";
    await createTestDatabase(); created = true; process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    client = new Client({ connectionString: process.env.TEST_DATABASE_URL }); await client.connect();
    const password = "transaction-history-password"; const hash = await bcrypt.hash(password, 10);
    const owner = (await client.query("SELECT u.id,b.id AS business_id FROM users u JOIN business_members bm ON bm.user_id=u.id JOIN businesses b ON b.id=bm.business_id WHERE u.platform_role='super_admin' AND bm.role='owner' AND bm.status='active' AND b.status='active' LIMIT 1")).rows[0];
    await client.query("UPDATE users SET username=$1,email=$2,password_hash=$3 WHERE id=$4", ["history_owner", "history-owner@example.test", hash, owner.id]);
    const category = (await client.query("INSERT INTO categories(business_id,name,description) VALUES($1,$2,$3) RETURNING id", [owner.business_id, "Historial", "Pruebas de historial"])).rows[0];
    const location = (await client.query("SELECT id FROM business_locations WHERE business_id=$1 AND status='active' ORDER BY id LIMIT 1", [owner.business_id])).rows[0];
    const products = (await client.query("INSERT INTO items(sku,name,description,brand,price,stock,category_id,business_id,status) VALUES($1,$2,'Descripción','Marca',10,$3,$4,$5,'active'),($6,$7,'Descripción','Marca',10,$8,$4,$5,'active'),($9,$10,'Descripción','Marca',10,$11,$4,$5,'active'),($12,$13,'Descripción','Marca',10,$14,$4,$5,'active') RETURNING id", ["HIST-ENTRY", "Producto entrada", 0, category.id, owner.business_id, "HIST-EXIT", "Producto salida", 10, "HIST-ADJUST", "Producto ajuste", 8, "HIST-SEED", "Producto semilla", 25])).rows;
    const [entry, exit, adjustment, seed] = products;
    await client.query("INSERT INTO inventory_balances(business_id,location_id,item_id,stock) VALUES($1,$2,$3,0),($1,$2,$4,10),($1,$2,$5,8),($1,$2,$6,25)", [owner.business_id, location.id, entry.id, exit.id, adjustment.id, seed.id]);
    await client.query("INSERT INTO inventory_movements (business_id,location_id,item_id,movement_type,quantity_delta,previous_stock,resulting_stock,reason,reference,created_by,created_at) SELECT $1,$2,$3,'entry',1,n - 1,n,'Movimiento reciente de prueba','SEED-' || n,$4,clock_timestamp() - INTERVAL '1 minute' FROM generate_series(1,25) n", [owner.business_id, location.id, seed.id, owner.id]);

    const foreignUser = (await client.query("INSERT INTO users(username,email,password_hash,platform_role) VALUES($1,$2,$3,'user') RETURNING id", ["history_foreign", "history-foreign@example.test", hash])).rows[0];
    const foreignBusiness = (await client.query("INSERT INTO businesses(name,slug,created_by,status) VALUES($1,$2,$3,'active') RETURNING id", ["Negocio historial ajeno", "negocio-historial-ajeno", foreignUser.id])).rows[0];
    await client.query("INSERT INTO business_members(business_id,user_id,role,status) VALUES($1,$2,'owner','active')", [foreignBusiness.id, foreignUser.id]);
    const foreignCategory = (await client.query("INSERT INTO categories(business_id,name,description) VALUES($1,$2,$3) RETURNING id", [foreignBusiness.id, "General", "Categoría ajena"])).rows[0];
    const foreignLocation = (await client.query("INSERT INTO business_locations(business_id,name,code,location_type,status,is_default) VALUES($1,$2,$3,'warehouse','active',true) RETURNING id", [foreignBusiness.id, "Bodega ajena", "AJENA", ])).rows[0];
    const foreignProduct = (await client.query("INSERT INTO items(sku,name,description,brand,price,stock,category_id,business_id,status) VALUES('FOREIGN-HISTORY','Producto ajeno','Descripción','Marca',10,1,$1,$2,'active') RETURNING id", [foreignCategory.id, foreignBusiness.id])).rows[0];
    await client.query("INSERT INTO inventory_movements(business_id,location_id,item_id,movement_type,quantity_delta,previous_stock,resulting_stock,reason,reference,created_by) VALUES($1,$2,$3,'entry',1,0,1,'Movimiento ajeno','FOREIGN-HISTORY',$4)", [foreignBusiness.id, foreignLocation.id, foreignProduct.id, foreignUser.id]);

    const { default: app } = await import("../app.js"); const { default: importedPool } = await import("../db/pool.js"); pool = importedPool;
    const agent = await login(app, "history_owner", password); const today = new Date().toISOString().slice(0, 10);
    const entryResponse = await create(agent, "/api/transactions/entries", { date: today, locationId: location.id, reference: "ENTRY-HISTORY", lines: [{ itemId: entry.id, quantity: 3, unitCost: 12 }] });
    const exitResponse = await create(agent, "/api/transactions/exits", { date: today, locationId: location.id, reference: "EXIT-HISTORY", reason: "Consumo interno", lines: [{ itemId: exit.id, quantity: 2 }] });
    const adjustmentResponse = await create(agent, "/api/transactions/adjustments", { date: today, locationId: location.id, reference: "ADJUST-HISTORY", notes: "Corrección de conteo", lines: [{ itemId: adjustment.id, quantity: 1, adjustmentType: "decrease" }] });
    const references = [entryResponse.body.data.transaction.reference, exitResponse.body.data.transaction.reference, adjustmentResponse.body.data.transaction.reference];

    const stored = await client.query("SELECT business_id,created_by,movement_type,quantity_delta,reference,created_at FROM inventory_movements WHERE reference = ANY($1::TEXT[]) ORDER BY created_at DESC,id DESC", [references]);
    assert.equal(stored.rowCount, 3);
    assert.ok(stored.rows.every((row) => Number(row.business_id) === Number(owner.business_id) && Number(row.created_by) === Number(owner.id)));
    assert.deepEqual(stored.rows.map((row) => row.movement_type), ["adjustment", "exit", "entry"]);
    assert.deepEqual(stored.rows.map((row) => Number(row.quantity_delta)), [-1, -2, 3]);
    assert.ok(stored.rows.every((row) => new Date(row.created_at) > new Date(Date.now() - 60_000)));

    const history = await agent.get("/api/transactions?limit=25").expect(200);
    const rows = history.body.data.transactions;
    assert.deepEqual(rows.slice(0, 3).map((row) => row.reference), ["ADJUST-HISTORY", "EXIT-HISTORY", "ENTRY-HISTORY"]);
    assert.deepEqual(rows.slice(0, 3).map((row) => row.type), ["adjustment", "exit", "entry"]);
    assert.deepEqual(rows.slice(0, 3).map((row) => row.quantity), [-1, -2, 3]);
    assert.ok(rows.slice(0, -1).every((row, index) => new Date(row.date) >= new Date(rows[index + 1].date)));
    assert.equal(rows.some((row) => row.reference === "FOREIGN-HISTORY"), false);
    assert.ok(rows.slice(0, 3).every((row) => row.user.id === Number(owner.id)));
  } finally {
    if (client) await client.end(); if (pool) await pool.end();
    if (original.DATABASE_URL === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = original.DATABASE_URL;
    if (created) await dropTestDatabase(); restoreEnvironment();
  }
});
