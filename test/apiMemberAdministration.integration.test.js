import test from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcrypt";
import pg from "pg";
import request from "supertest";
import { createTestDatabase, dropTestDatabase } from "./helpers/testDatabase.js";

const { Client } = pg;
const hasTestDatabaseUrl = Boolean(process.env.TEST_DATABASE_URL);
const original = { NODE_ENV: process.env.NODE_ENV, SESSION_SECRET: process.env.SESSION_SECRET, DATABASE_URL: process.env.DATABASE_URL };
const restore = () => Object.entries(original).forEach(([key, value]) => value === undefined ? delete process.env[key] : process.env[key] = value);
async function csrf(agent) {
  const response = await agent.get("/api/csrf-token").expect(200);
  return response.body.data.csrfToken;
}

async function login(app, identifier, password) {
  const agent = request.agent(app);
  const token = await csrf(agent);
  await agent
    .post("/api/auth/login")
    .set("x-csrf-token", token)
    .send({ identifier, password })
    .expect(200);
  return agent;
}

test("administración API de miembros", { skip: !hasTestDatabaseUrl }, async (t) => {
  let client; let pool; let made = false;
  try {
    process.env.NODE_ENV = "test"; process.env.SESSION_SECRET = "members-admin-test";
    await createTestDatabase(); made = true; process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    client = new Client({ connectionString: process.env.TEST_DATABASE_URL }); await client.connect();
    const password = "members-admin-password"; const hash = await bcrypt.hash(password, 10);
    const owner = (await client.query("SELECT u.id, b.id business_id FROM users u JOIN business_members bm ON bm.user_id=u.id JOIN businesses b ON b.id=bm.business_id WHERE bm.role='owner' LIMIT 1")).rows[0];
    await client.query("UPDATE users SET username=$1,email=$2,password_hash=$3 WHERE id=$4", ["members_admin_owner", "members-admin-owner@example.test", hash, owner.id]);
    const users = {};
    for (const [name, role] of [["manager", "manager"], ["viewer", "viewer"], ["foreign", "viewer"]]) {
      users[name] = (await client.query("INSERT INTO users(username,email,password_hash,platform_role) VALUES($1,$2,$3,'user') RETURNING id", [`members_${name}`, `members-${name}@example.test`, hash])).rows[0];
      if (name !== "foreign") await client.query("INSERT INTO business_members(business_id,user_id,role,status) VALUES($1,$2,$3,'active')", [owner.business_id, users[name].id, role]);
    }
    users.foreignViewer = (await client.query("INSERT INTO users(username,email,password_hash,platform_role) VALUES($1,$2,$3,'user') RETURNING id", ["members_foreign_viewer", "members-foreign-viewer@example.test", hash])).rows[0];
    await client.query("BEGIN");
    let foreignBusiness;
    let foreignMember;
    try {
      foreignBusiness = (await client.query("INSERT INTO businesses(name,slug,created_by,status) VALUES('Ajeno miembros','ajeno-miembros',$1,'active') RETURNING id", [users.foreign.id])).rows[0];
      await client.query("INSERT INTO business_members(business_id,user_id,role,status) VALUES($1,$2,'owner','active')", [foreignBusiness.id, users.foreign.id]);
      await client.query("INSERT INTO categories(business_id,name,description,is_default) VALUES($1,'General','Categoría predeterminada',true)", [foreignBusiness.id]);
      foreignMember = (await client.query("INSERT INTO business_members(business_id,user_id,role,status) VALUES($1,$2,'viewer','active') RETURNING id", [foreignBusiness.id, users.foreignViewer.id])).rows[0];
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    const memberIds = Object.fromEntries((await client.query("SELECT id,user_id FROM business_members WHERE business_id=$1", [owner.business_id])).rows.map((row) => [row.user_id, row.id]));
    const { default: app } = await import("../app.js"); const { default: importedPool } = await import("../db/pool.js"); pool = importedPool;
    const ownerAgent = await login(app, "members_admin_owner", password);

    await t.test("owner cambia manager y viewer sin alterar estado", async () => {
      for (const [id, role] of [[memberIds[users.manager.id], "viewer"], [memberIds[users.viewer.id], "manager"]]) {
        const response = await ownerAgent.put(`/api/members/${id}/role`).set("x-csrf-token", await csrf(ownerAgent)).send({ role }).expect(200);
        assert.equal(response.body.data.member.role, role); assert.equal(response.body.data.member.status, "active");
      }
    });
    await t.test("suspender bloquea acceso y reactivar conserva fila y rol", async () => {
      const id = memberIds[users.manager.id]; const manager = await login(app, "members_manager", password);
      await ownerAgent.post(`/api/members/${id}/suspend`).set("x-csrf-token", await csrf(ownerAgent)).expect(200);
      await manager.get("/api/members").expect(409);
      await ownerAgent.post(`/api/members/${id}/reactivate`).set("x-csrf-token", await csrf(ownerAgent)).expect(200);
      assert.equal((await client.query("SELECT id,status FROM business_members WHERE id=$1", [id])).rows[0].id, id);
    });
    await t.test("remover bloquea acceso y reactivar no duplica", async () => {
      const id = memberIds[users.viewer.id]; const viewer = await login(app, "members_viewer", password);
      await ownerAgent.post(`/api/members/${id}/remove`).set("x-csrf-token", await csrf(ownerAgent)).expect(200);
      await viewer.get("/api/members").expect(409);
      await ownerAgent.post(`/api/members/${id}/reactivate`).set("x-csrf-token", await csrf(ownerAgent)).expect(200);
      assert.equal((await client.query("SELECT COUNT(*)::int count FROM business_members WHERE business_id=$1 AND user_id=$2", [owner.business_id, users.viewer.id])).rows[0].count, 1);
    });
    await t.test("protecciones y errores no cambian filas", async () => {
      await ownerAgent.post(`/api/members/${memberIds[owner.id]}/suspend`).set("x-csrf-token", await csrf(ownerAgent)).expect(409).expect((res) => assert.equal(res.body.error.code, "OWNER_PROTECTED"));
      await ownerAgent.post(`/api/members/${foreignMember.id}/suspend`).set("x-csrf-token", await csrf(ownerAgent)).expect(404);
      await ownerAgent.put(`/api/members/${memberIds[users.manager.id]}/role`).set("x-csrf-token", await csrf(ownerAgent)).send({ role: "owner" }).expect(400);
      await ownerAgent.post(`/api/members/${memberIds[users.manager.id]}/suspend`).set("x-csrf-token", await csrf(ownerAgent)).expect(200);
      await ownerAgent.post(`/api/members/${memberIds[users.manager.id]}/suspend`).set("x-csrf-token", await csrf(ownerAgent)).expect(409);
      const manager = await login(app, "members_manager", password);
      await manager.post(`/api/members/${memberIds[users.viewer.id]}/remove`).set("x-csrf-token", await csrf(manager)).expect(409);
    });
  } finally {
    if (client) await client.end(); if (pool) await pool.end();
    if (original.DATABASE_URL === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = original.DATABASE_URL;
    if (made) await dropTestDatabase(); restore();
  }
});
