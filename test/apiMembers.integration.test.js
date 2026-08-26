import test from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcrypt";
import pg from "pg";
import request from "supertest";

import { createTestDatabase, dropTestDatabase } from "./helpers/testDatabase.js";

const { Client } = pg;
const hasTestDatabaseUrl = Boolean(process.env.TEST_DATABASE_URL);
const originalEnvironment = {
  NODE_ENV: process.env.NODE_ENV,
  SESSION_SECRET: process.env.SESSION_SECRET,
  DATABASE_URL: process.env.DATABASE_URL
};

function restoreEnvironment() {
  for (const [name, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

async function csrfToken(agent) {
  return (await agent.get("/api/csrf-token").expect(200)).body.data.csrfToken;
}

async function login(app, identifier, password) {
  const agent = request.agent(app);
  const token = await csrfToken(agent);
  await agent.post("/api/auth/login").set("x-csrf-token", token).send({ identifier, password }).expect(200);
  return agent;
}

async function user(client, username, passwordHash) {
  const result = await client.query(
    "INSERT INTO users(username, email, password_hash, platform_role) VALUES($1, $2, $3, 'user') RETURNING id",
    [username, `${username}@example.test`, passwordHash]
  );
  return result.rows[0];
}

test("consulta del equipo mediante API", { skip: !hasTestDatabaseUrl }, async (t) => {
  let client;
  let pool;
  let databaseCreated = false;

  try {
    process.env.NODE_ENV = "test";
    process.env.SESSION_SECRET = "integration-test-secret";
    await createTestDatabase();
    databaseCreated = true;
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    client = new Client({ connectionString: process.env.TEST_DATABASE_URL });
    await client.connect();

    const password = "api-members-password";
    const passwordHash = await bcrypt.hash(password, 10);
    const owner = (await client.query(
      `
        SELECT u.id, b.id AS business_id
        FROM users u
        INNER JOIN business_members bm ON bm.user_id = u.id
        INNER JOIN businesses b ON b.id = bm.business_id
        WHERE u.platform_role = 'super_admin'
          AND bm.role = 'owner'
          AND bm.status = 'active'
          AND b.status = 'active'
        LIMIT 1
      `
    )).rows[0];
    assert.ok(owner);
    await client.query(
      "UPDATE users SET username = $1, email = $2, password_hash = $3 WHERE id = $4",
      ["members_owner", "members-owner@example.test", passwordHash, owner.id]
    );
    const manager = await user(client, "members_manager", passwordHash);
    const viewer = await user(client, "members_viewer", passwordHash);
    const suspended = await user(client, "members_suspended", passwordHash);
    const removed = await user(client, "members_removed", passwordHash);
    const foreignUser = await user(client, "members_foreign", passwordHash);
    await client.query(
      `
        INSERT INTO business_members(business_id, user_id, role, status)
        VALUES
          ($1, $2, 'manager', 'active'),
          ($1, $3, 'viewer', 'active'),
          ($1, $4, 'manager', 'suspended'),
          ($1, $5, 'viewer', 'removed')
      `,
      [owner.business_id, manager.id, viewer.id, suspended.id, removed.id]
    );

    await client.query(
      `
        INSERT INTO business_invitations(
          business_id, email_normalized, offered_role, token_hash, invited_by,
          status, expires_at, created_at, accepted_at
        ) VALUES
          ($1, 'vigente-equipo@example.test', 'manager', repeat('a', 64), $2, 'pending', CURRENT_TIMESTAMP + INTERVAL '1 day', CURRENT_TIMESTAMP - INTERVAL '1 day', NULL),
          ($1, 'vencida-equipo@example.test', 'viewer', repeat('b', 64), $2, 'pending', CURRENT_TIMESTAMP - INTERVAL '1 day', CURRENT_TIMESTAMP - INTERVAL '2 days', NULL),
          ($1, 'aceptada-equipo@example.test', 'manager', repeat('c', 64), $2, 'accepted', CURRENT_TIMESTAMP + INTERVAL '10 days', CURRENT_TIMESTAMP - INTERVAL '3 days', CURRENT_TIMESTAMP - INTERVAL '2 days')
      `,
      [owner.business_id, owner.id]
    );

    await client.query("BEGIN");
    let foreignBusiness;
    try {
    foreignBusiness = (await client.query(
      "INSERT INTO businesses(name, slug, created_by, status) VALUES($1, $2, $3, 'active') RETURNING id",
      ["Negocio ajeno equipo", "negocio-ajeno-equipo", foreignUser.id]
    )).rows[0];
    await client.query(
      "INSERT INTO business_members(business_id, user_id, role, status) VALUES($1, $2, 'owner', 'active')",
      [foreignBusiness.id, foreignUser.id]
    );
    await client.query("INSERT INTO categories(business_id,name,description,is_default) VALUES($1,'General','Categoría predeterminada',true)", [foreignBusiness.id]);
    await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    await client.query(
      `INSERT INTO business_invitations(business_id, email_normalized, offered_role, token_hash, invited_by)
       VALUES($1, 'ajena-equipo@example.test', 'viewer', repeat('d', 64), $2)`,
      [foreignBusiness.id, foreignUser.id]
    );

    const { default: app } = await import("../app.js");
    const { default: importedPool } = await import("../db/pool.js");
    pool = importedPool;
    const ownerAgent = await login(app, "members_owner", password);
    const managerAgent = await login(app, "members_manager", password);
    const viewerAgent = await login(app, "members_viewer", password);

    await t.test("owner recibe solo miembros e invitaciones del negocio sin secretos", async () => {
      const response = await ownerAgent.get("/api/members").expect(200).expect("Cache-Control", "no-store");
      const { members, invitations } = response.body.data;
      assert.equal(members.length, 5);
      assert.equal(invitations.length, 3);
      assert.equal(members.some((member) => member.user.username === "members_foreign"), false);
      assert.equal(invitations.some((invitation) => invitation.email === "ajena-equipo@example.test"), false);
      assert.equal(members[0].role, "owner");
      assert.equal(members[0].isCurrentUser, true);
      assert.equal(Object.hasOwn(members[0].user, "passwordHash"), false);
      assert.equal(Object.hasOwn(members[0].user, "platformRole"), false);
      assert.equal(Object.hasOwn(invitations[0], "tokenHash"), false);
    });

    await t.test("conteos, vencimiento calculado y orden son correctos", async () => {
      const response = await ownerAgent.get("/api/members").expect(200);
      const { members, invitations, summary } = response.body.data;
      assert.deepEqual(summary, { activeMembers: 3, pendingInvitations: 1 });
      assert.deepEqual(members.slice(0, 3).map((member) => member.user.username), ["members_owner", "members_manager", "members_viewer"]);
      assert.deepEqual(invitations.slice(0, 2).map((invitation) => invitation.email), ["vigente-equipo@example.test", "vencida-equipo@example.test"]);
      assert.equal(invitations.find((invitation) => invitation.email === "vencida-equipo@example.test").isExpired, true);
      assert.equal(invitations.find((invitation) => invitation.email === "vigente-equipo@example.test").isExpired, false);
      assert.ok(invitations.find((invitation) => invitation.email === "aceptada-equipo@example.test").acceptedAt);
    });

    await t.test("manager y viewer reciben 403; cambiar negocio conserva aislamiento", async () => {
      for (const agent of [managerAgent, viewerAgent]) {
        const denied = await agent.get("/api/members").expect(403);
        assert.equal(denied.body.error.code, "FORBIDDEN");
      }
      await client.query("BEGIN");
      let ownedOtherBusiness;
      try {
        ownedOtherBusiness = (await client.query("INSERT INTO businesses(name, slug, created_by, status) VALUES($1, $2, $3, 'active') RETURNING id", ["Segundo negocio equipo", "segundo-negocio-equipo", owner.id])).rows[0];
        await client.query("INSERT INTO business_members(business_id, user_id, role, status) VALUES($1, $2, 'owner', 'active')", [ownedOtherBusiness.id, owner.id]);
        await client.query("INSERT INTO categories(business_id,name,description,is_default) VALUES($1,'General','Categoría predeterminada',true)", [ownedOtherBusiness.id]);
        await client.query("COMMIT");
      } catch (error) { await client.query("ROLLBACK"); throw error; }
      await client.query(
        `INSERT INTO business_invitations(business_id, email_normalized, offered_role, token_hash, invited_by)
         VALUES($1, 'segundo-negocio-equipo@example.test', 'viewer', repeat('e', 64), $2)`,
        [ownedOtherBusiness.id, owner.id]
      );
      const token = await csrfToken(ownerAgent);
      await ownerAgent.put("/api/session/active-business").set("x-csrf-token", token).send({ businessId: ownedOtherBusiness.id }).expect(200);
      const switched = await ownerAgent.get("/api/members").expect(200);
      assert.equal(switched.body.data.members.length, 1);
      assert.equal(switched.body.data.members[0].user.username, "members_owner");
      assert.deepEqual(switched.body.data.invitations.map((invitation) => invitation.email), ["segundo-negocio-equipo@example.test"]);
    });
  } finally {
    if (client) await client.end();
    if (pool) await pool.end();
    if (originalEnvironment.DATABASE_URL === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalEnvironment.DATABASE_URL;
    if (databaseCreated) await dropTestDatabase();
    restoreEnvironment();
  }
});
