import test from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcrypt";
import pg from "pg";
import request from "supertest";
import { createTestDatabase, dropTestDatabase } from "./helpers/testDatabase.js";

const { Client } = pg;
const enabled = Boolean(process.env.TEST_DATABASE_URL);

async function login(app, identifier, password) {
  const agent = request.agent(app);
  const token = (await agent.get("/api/csrf-token").expect(200)).body.data.csrfToken;
  await agent.post("/api/auth/login").set("x-csrf-token", token).send({ identifier, password }).expect(200);
  return agent;
}

test("los umbrales usan las dos ubicaciones del negocio activo y rechazan una ajena", { skip: !enabled }, async () => {
  let client; let pool; let made = false;
  const original = { NODE_ENV: process.env.NODE_ENV, DATABASE_URL: process.env.DATABASE_URL, SESSION_SECRET: process.env.SESSION_SECRET };
  try {
    process.env.NODE_ENV = "test"; process.env.SESSION_SECRET = "threshold-regression-secret";
    await createTestDatabase(); made = true; process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    client = new Client({ connectionString: process.env.TEST_DATABASE_URL }); await client.connect();
    const hash = await bcrypt.hash("threshold-regression-password", 10);
    await client.query("BEGIN");
    let owner; let category; let second;
    try {
      const ownerUser = (await client.query("INSERT INTO users(username,email,password_hash,platform_role) VALUES('threshold_owner','threshold-owner@test.local',$1,'user') RETURNING id", [hash])).rows[0];
      owner = (await client.query("INSERT INTO businesses(name,slug,created_by,status) VALUES('Negocio umbrales','threshold-regression',$1,'active') RETURNING id", [ownerUser.id])).rows[0];
      await client.query("INSERT INTO business_members(business_id,user_id,role,status) VALUES($1,$2,'owner','active')", [owner.id, ownerUser.id]);
      category = (await client.query("INSERT INTO categories(name,description,business_id,is_default) VALUES('General','Categoría predeterminada',$1,true) RETURNING id", [owner.id])).rows[0];
      await client.query("INSERT INTO business_locations(business_id,name,code,location_type,status,is_default) VALUES($1,'Sucursal principal','MAIN','branch','active',true)", [owner.id]);
      second = (await client.query("INSERT INTO business_locations(business_id,name,code,location_type,status,is_default) VALUES($1,'Bodega umbral','THR-2','warehouse','active',false) RETURNING id", [owner.id])).rows[0];
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    const product = (await client.query("INSERT INTO items(sku,name,description,brand,price,stock,category_id,business_id,status) VALUES('THR-REG','Producto umbral','','',1,0,$1,$2,'active') RETURNING id", [category.id, owner.id])).rows[0];
    await client.query("BEGIN");
    let foreignBusiness; let foreignLocation;
    try {
      const foreignUser = (await client.query("INSERT INTO users(username,email,password_hash,platform_role) VALUES('threshold_foreign','threshold-foreign@test.local',$1,'user') RETURNING id", [hash])).rows[0];
      foreignBusiness = (await client.query("INSERT INTO businesses(name,slug,created_by,status) VALUES('Negocio umbral ajeno','threshold-foreign',$1,'active') RETURNING id", [foreignUser.id])).rows[0];
      await client.query("INSERT INTO business_members(business_id,user_id,role,status) VALUES($1,$2,'owner','active')", [foreignBusiness.id, foreignUser.id]);
      await client.query("INSERT INTO categories(name,description,business_id,is_default) VALUES('General','Categoría predeterminada',$1,true)", [foreignBusiness.id]);
      foreignLocation = (await client.query("INSERT INTO business_locations(business_id,name,code,location_type,status,is_default) VALUES($1,'Bodega ajena','THR-X','warehouse','active',true) RETURNING id", [foreignBusiness.id])).rows[0];
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    const { default: app } = await import("../app.js"); const importedPool = (await import("../db/pool.js")).default; pool = importedPool;
    const agent = await login(app, "threshold_owner", "threshold-regression-password");
    const configuration = (await agent.get(`/api/products/${product.id}/thresholds`).expect(200)).body.data;
    const locations = configuration.locations.filter((location) => [second.id, ...configuration.locations.map((item) => item.id)].includes(location.id));
    assert.equal(locations.length >= 2, true);
    for (const location of locations.slice(0, 2)) {
      await agent.put(`/api/products/${product.id}/thresholds/${location.id}`).set("x-csrf-token", (await agent.get("/api/csrf-token")).body.data.csrfToken).send({ minimumStock: 3 }).expect(200);
    }
    const foreignResponse = await agent.put(`/api/products/${product.id}/thresholds/${foreignLocation.id}`).set("x-csrf-token", (await agent.get("/api/csrf-token")).body.data.csrfToken).send({ minimumStock: 3 });
    assert.equal(foreignResponse.status, 404); assert.equal(foreignResponse.body.error.code, "LOCATION_NOT_FOUND");
  } finally {
    if (client) await client.end(); if (pool) await pool.end();
    if (original.DATABASE_URL === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = original.DATABASE_URL;
    if (made) await dropTestDatabase();
    for (const [key, value] of Object.entries(original)) if (key !== "DATABASE_URL") value === undefined ? delete process.env[key] : process.env[key] = value;
  }
});
