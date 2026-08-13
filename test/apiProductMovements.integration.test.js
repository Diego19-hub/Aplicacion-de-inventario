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

test("historial de movimientos de producto mediante API", { skip: !available }, async (t) => {
  let client; let pool; let databaseCreated = false;
  try {
    process.env.NODE_ENV = "test"; process.env.SESSION_SECRET = "integration-test-secret";
    await createTestDatabase(); databaseCreated = true; process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    client = new Client({ connectionString: process.env.TEST_DATABASE_URL }); await client.connect();
    const password = "api-product-history-password"; const hash = await bcrypt.hash(password, 10);
    const owner = (await client.query(`SELECT u.id,b.id business_id FROM users u JOIN business_members bm ON bm.user_id=u.id JOIN businesses b ON b.id=bm.business_id WHERE u.platform_role='super_admin' AND bm.role='owner' AND bm.status='active' AND b.status='active' LIMIT 1`)).rows[0];
    await client.query("UPDATE users SET username=$1,email=$2,password_hash=$3 WHERE id=$4", ["history_owner", "history-owner@example.test", hash, owner.id]);
    const category = (await client.query("INSERT INTO categories(name,description,business_id) VALUES($1,$2,$3) RETURNING id", ["Categoría historial", "Categoría", owner.business_id])).rows[0];
    const locations = (await client.query("SELECT id,name,code FROM business_locations WHERE business_id=$1 AND status='active' ORDER BY id", [owner.business_id])).rows;
    const secondLocation = (await client.query("INSERT INTO business_locations(business_id,name,code,location_type,status,is_default) VALUES($1,$2,$3,'warehouse','active',false) RETURNING id,name,code", [owner.business_id, "Bodega historial", "HIST"])).rows[0];
    const [mainLocation] = locations;
    const product = (await client.query(`INSERT INTO items(sku,name,description,brand,price,stock,category_id,business_id,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'active') RETURNING id`, ["HIS-001", "Producto historial", "Descripción historial", "Marca", 7, 6, category.id, owner.business_id])).rows[0];
    await client.query("INSERT INTO inventory_balances(business_id,location_id,item_id,stock) VALUES($1,$2,$3,4),($1,$4,$3,2)", [owner.business_id, mainLocation.id, product.id, secondLocation.id]);
    await client.query(`INSERT INTO inventory_movements(business_id,location_id,item_id,movement_type,quantity_delta,previous_stock,resulting_stock,reason,created_by) VALUES($1,$2,$3,'opening_balance',4,0,4,$4,$5),($1,$6,$3,'entry',2,0,2,$7,$5),($1,$2,$3,'exit',-1,4,3,$8,$5)`, [owner.business_id, mainLocation.id, product.id, "Saldo principal", owner.id, secondLocation.id, "Entrada histórica", "Salida histórica"]);
    const manager = (await client.query("INSERT INTO users(username,email,password_hash,platform_role) VALUES($1,$2,$3,'user') RETURNING id", ["history_manager", "history-manager@example.test", hash])).rows[0];
    const viewer = (await client.query("INSERT INTO users(username,email,password_hash,platform_role) VALUES($1,$2,$3,'user') RETURNING id", ["history_viewer", "history-viewer@example.test", hash])).rows[0];
    await client.query("INSERT INTO business_members(business_id,user_id,role,status) VALUES($1,$2,'manager','active'),($1,$3,'viewer','active')", [owner.business_id, manager.id, viewer.id]);
    const foreignUser = (await client.query("INSERT INTO users(username,email,password_hash,platform_role) VALUES($1,$2,$3,'user') RETURNING id", ["history_foreign", "history-foreign@example.test", hash])).rows[0];
    const foreignBusiness = (await client.query("INSERT INTO businesses(name,slug,created_by,status) VALUES($1,$2,$3,'active') RETURNING id", ["Negocio ajeno historial", "negocio-ajeno-historial", foreignUser.id])).rows[0];
    await client.query("INSERT INTO business_members(business_id,user_id,role,status) VALUES($1,$2,'owner','active')", [foreignBusiness.id, foreignUser.id]);
    const foreignCategory = (await client.query("INSERT INTO categories(name,description,business_id) VALUES($1,$2,$3) RETURNING id", ["Categoría ajena", "Categoría", foreignBusiness.id])).rows[0];
    const foreignProduct = (await client.query(`INSERT INTO items(sku,name,description,brand,price,stock,category_id,business_id,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'active') RETURNING id`, ["HIS-FOR", "Producto ajeno", "Descripción", "Marca", 1, 0, foreignCategory.id, foreignBusiness.id])).rows[0];
    const archivedProduct = (await client.query(`INSERT INTO items(sku,name,description,brand,price,stock,category_id,business_id,status,archived_at,archived_by,archive_reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'archived',clock_timestamp(),$9,$10) RETURNING id`, ["HIS-ARC", "Producto archivado", "Descripción", "Marca", 1, 0, category.id, owner.business_id, owner.id, "Prueba"])).rows[0];
    const foreignLocation = (await client.query("INSERT INTO business_locations(business_id,name,code,location_type,status,is_default) VALUES($1,$2,$3,'warehouse','active',false) RETURNING id", [foreignBusiness.id, "Bodega ajena", "AJENA"])).rows[0];
    const { default: app } = await import("../app.js"); const { default: importedPool } = await import("../db/pool.js"); pool = importedPool;
    const ownerAgent = await login(app, "history_owner", password);
    await t.test("owner, manager y viewer obtienen solo movimientos del producto activo propio", async () => {
      for (const identifier of ["history_owner", "history_manager", "history_viewer"]) {
        const agent = identifier === "history_owner" ? ownerAgent : await login(app, identifier, password);
        const response = await agent.get(`/api/products/${product.id}/movements`).expect(200).expect("Cache-Control", "no-store");
        assert.equal(response.body.data.product.id, product.id); assert.equal(response.body.data.pagination.totalItems, 3); assert.equal(response.body.data.movements.every((movement) => movement.location.id === mainLocation.id || movement.location.id === secondLocation.id), true);
      }
    });
    await t.test("filtros de ubicación y tipo conservan conteo y resultados", async () => {
      const locationResponse = await ownerAgent.get(`/api/products/${product.id}/movements?location=${secondLocation.id}`).expect(200);
      assert.equal(locationResponse.body.data.pagination.totalItems, 1); assert.equal(locationResponse.body.data.movements[0].type, "entry");
      const typeResponse = await ownerAgent.get(`/api/products/${product.id}/movements?type=exit`).expect(200);
      assert.equal(typeResponse.body.data.pagination.totalItems, 1); assert.equal(typeResponse.body.data.movements[0].type, "exit");
    });
    await t.test("producto ajeno/archivado devuelve 404 y ubicación ajena/página inválida se normalizan", async () => {
      for (const id of [foreignProduct.id, archivedProduct.id]) { const response = await ownerAgent.get(`/api/products/${id}/movements`).expect(404); assert.equal(response.body.error.code, "PRODUCT_NOT_FOUND"); }
      const locationResponse = await ownerAgent.get(`/api/products/${product.id}/movements?location=${foreignLocation.id}&page=1.5`).expect(200);
      assert.equal(locationResponse.body.data.pagination.totalItems, 0); assert.equal(locationResponse.body.data.pagination.page, 1); assert.deepEqual(locationResponse.body.data.movements, []);
    });
  } finally { if (client) await client.end(); if (pool) await pool.end(); if (original.DATABASE_URL === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = original.DATABASE_URL; if (databaseCreated) await dropTestDatabase(); restoreEnvironment(); }
});
