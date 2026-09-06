import test from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcrypt";
import pg from "pg";
import request from "supertest";

import { createTestDatabase, dropTestDatabase } from "./helpers/testDatabase.js";

const { Client } = pg;
const available = Boolean(process.env.TEST_DATABASE_URL);

async function csrf(agent) {
  return (await agent.get("/api/csrf-token").expect(200)).body.data.csrfToken;
}

async function login(app, identifier, password) {
  const agent = request.agent(app);
  const token = await csrf(agent);
  const response = await agent
    .post("/api/auth/login")
    .set("x-csrf-token", token)
    .send({ identifier, password });
  assert.equal(response.status, 200, `Login respondió ${response.status}: ${JSON.stringify(response.body)}`);
  return agent;
}

test("configuración de valuación FIFO por negocio y rol", { skip: !available }, async () => {
  let client;
  let pool;
  let created = false;
  const previous = { NODE_ENV: process.env.NODE_ENV, SESSION_SECRET: process.env.SESSION_SECRET, DATABASE_URL: process.env.DATABASE_URL };
  try {
    process.env.NODE_ENV = "test";
    process.env.SESSION_SECRET = "valuation-settings-test-secret";
    await createTestDatabase();
    created = true;
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    client = new Client({ connectionString: process.env.TEST_DATABASE_URL });
    await client.connect();
    const password = "valuation-settings-password";
    const hash = await bcrypt.hash(password, 10);
    const owner = (await client.query(`SELECT u.id,b.id AS business_id FROM users u JOIN business_members bm ON bm.user_id=u.id JOIN businesses b ON b.id=bm.business_id WHERE bm.role='owner' AND bm.status='active' AND b.status='active' LIMIT 1`)).rows[0];
    assert.ok(owner);
    await client.query("UPDATE users SET username='valuation_owner',email='valuation-owner@example.test',password_hash=$1 WHERE id=$2", [hash, owner.id]);
    const manager = (await client.query("INSERT INTO users(username,email,password_hash,platform_role) VALUES('valuation_manager','valuation-manager@example.test',$1,'user') RETURNING id", [hash])).rows[0];
    const viewer = (await client.query("INSERT INTO users(username,email,password_hash,platform_role) VALUES('valuation_viewer','valuation-viewer@example.test',$1,'user') RETURNING id", [hash])).rows[0];
    await client.query("INSERT INTO business_members(business_id,user_id,role,status) VALUES($1,$2,'manager','active'),($1,$3,'viewer','active')", [owner.business_id, manager.id, viewer.id]);
    const foreignUser = (await client.query("INSERT INTO users(username,email,password_hash,platform_role) VALUES('valuation_foreign','valuation-foreign@example.test',$1,'user') RETURNING id", [hash])).rows[0];
    await client.query("BEGIN");
    let foreign;
    try {
      foreign = (await client.query("INSERT INTO businesses(name,slug,created_by,status,inventory_valuation_method) VALUES('Negocio valuación ajeno','negocio-valuacion-ajeno',$1,'active','fifo') RETURNING id", [foreignUser.id])).rows[0];
      await client.query("INSERT INTO business_members(business_id,user_id,role,status) VALUES($1,$2,'owner','active')", [foreign.id, foreignUser.id]);
      await client.query("INSERT INTO categories(business_id,name,description,is_default) VALUES($1,'General','Categoría predeterminada',true)", [foreign.id]);
      await client.query("INSERT INTO business_locations(business_id,name,code,location_type,status,is_default) VALUES($1,'Bodega','VAL-AJENA','warehouse','active',true)", [foreign.id]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }

    const { default: app } = await import("../app.js");
    const { default: importedPool } = await import("../db/pool.js");
    pool = importedPool;
    const ownerAgent = await login(app, "valuation_owner", password);
    const managerAgent = await login(app, "valuation_manager", password);
    const viewerAgent = await login(app, "valuation_viewer", password);

    const before = await client.query("SELECT inventory_valuation_method FROM businesses WHERE id=$1", [owner.business_id]);
    const beforeBalances = await client.query("SELECT count(*)::int AS count FROM inventory_balances WHERE business_id=$1", [owner.business_id]);
    const beforeMovements = await client.query("SELECT count(*)::int AS count FROM inventory_movements WHERE business_id=$1", [owner.business_id]);
    const beforeLayers = await client.query("SELECT count(*)::int AS count FROM inventory_cost_layers WHERE business_id=$1", [owner.business_id]);
    const beforeAudit = await client.query("SELECT count(*)::int AS count FROM audit_log WHERE business_id=$1", [owner.business_id]);

    const initial = await ownerAgent.get("/api/business/settings/valuation").expect(200);
    assert.equal(initial.body.data.businessId, Number(owner.business_id));
    assert.equal(initial.body.data.valuationMethod, before.rows[0].inventory_valuation_method);
    const fifo = await ownerAgent.patch("/api/business/settings/valuation").set("x-csrf-token", await csrf(ownerAgent)).send({ valuationMethod: "fifo" }).expect(200);
    assert.equal(fifo.body.data.valuationMethod, "fifo");
    assert.match(fifo.body.data.warning, /inicialización manual/i);
    assert.equal((await client.query("SELECT inventory_valuation_method FROM businesses WHERE id=$1", [foreign.id])).rows[0].inventory_valuation_method, "fifo");
    assert.equal((await client.query("SELECT count(*)::int AS count FROM inventory_balances WHERE business_id=$1", [owner.business_id])).rows[0].count, beforeBalances.rows[0].count);
    assert.equal((await client.query("SELECT count(*)::int AS count FROM inventory_movements WHERE business_id=$1", [owner.business_id])).rows[0].count, beforeMovements.rows[0].count);
    assert.equal((await client.query("SELECT count(*)::int AS count FROM inventory_cost_layers WHERE business_id=$1", [owner.business_id])).rows[0].count, beforeLayers.rows[0].count);
    assert.equal((await client.query("SELECT count(*)::int AS count FROM audit_log WHERE business_id=$1", [owner.business_id])).rows[0].count, beforeAudit.rows[0].count + 1);

    const managerUpdate = await managerAgent.patch("/api/business/settings/valuation").set("x-csrf-token", await csrf(managerAgent)).send({ valuationMethod: "average" }).expect(200);
    assert.equal(managerUpdate.body.data.valuationMethod, "average");
    assert.equal((await client.query("SELECT count(*)::int AS count FROM audit_log WHERE business_id=$1", [owner.business_id])).rows[0].count, beforeAudit.rows[0].count + 2);
    await viewerAgent.get("/api/business/settings/valuation").expect(200);
    await viewerAgent.patch("/api/business/settings/valuation").set("x-csrf-token", await csrf(viewerAgent)).send({ valuationMethod: "fifo" }).expect(403);
    await ownerAgent.patch("/api/business/settings/valuation").set("x-csrf-token", await csrf(ownerAgent)).send({ valuationMethod: "invalid" }).expect(400);
    assert.equal((await client.query("SELECT inventory_valuation_method FROM businesses WHERE id=$1", [owner.business_id])).rows[0].inventory_valuation_method, "average");
  } finally {
    if (client) await client.end();
    if (pool) await pool.end();
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    if (created) await dropTestDatabase();
  }
});
