import test from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcrypt";
import crypto from "crypto";
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

async function post(agent, path, body, expectedStatus) {
  const token = await csrfToken(agent);
  return agent.post(path).set("x-csrf-token", token).send(body).expect(expectedStatus);
}

async function createUser(client, username, passwordHash) {
  const result = await client.query(
    "INSERT INTO users(username, email, password_hash, platform_role) VALUES($1, $2, $3, 'user') RETURNING id, email",
    [username, `${username}@example.test`, passwordHash]
  );
  return result.rows[0];
}

test("creación y revocación de invitaciones mediante API", { skip: !hasTestDatabaseUrl }, async (t) => {
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

    const password = "api-invitations-password";
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
      ["invitation_owner", "invitation-owner@example.test", passwordHash, owner.id]
    );
    const manager = await createUser(client, "invitation_manager", passwordHash);
    const viewer = await createUser(client, "invitation_viewer", passwordHash);
    const activeMember = await createUser(client, "invitation_active_member", passwordHash);
    const foreignUser = await createUser(client, "invitation_foreign", passwordHash);
    await client.query(
      `INSERT INTO business_members(business_id, user_id, role, status)
       VALUES($1, $2, 'manager', 'active'), ($1, $3, 'viewer', 'active'), ($1, $4, 'viewer', 'active')`,
      [owner.business_id, manager.id, viewer.id, activeMember.id]
    );
    let foreignBusiness;
    try {
      await client.query("BEGIN");
      foreignBusiness = (await client.query(
        "INSERT INTO businesses(name, slug, created_by, status) VALUES($1, $2, $3, 'active') RETURNING id",
        ["Negocio ajeno invitaciones", "negocio-ajeno-invitaciones", foreignUser.id]
      )).rows[0];
      await client.query(
        "INSERT INTO business_members(business_id, user_id, role, status) VALUES($1, $2, 'owner', 'active')",
        [foreignBusiness.id, foreignUser.id]
      );
      await client.query(
        "INSERT INTO categories(business_id, name, description, is_default) VALUES($1, 'General', 'Categoría predeterminada', true)",
        [foreignBusiness.id]
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
    const foreignInvitation = (await client.query(
      `INSERT INTO business_invitations(business_id, email_normalized, offered_role, token_hash, invited_by)
       VALUES($1, 'ajena-invitacion@example.test', 'viewer', repeat('a', 64), $2) RETURNING id`,
      [foreignBusiness.id, foreignUser.id]
    )).rows[0];

    const { default: app } = await import("../app.js");
    const { default: importedPool } = await import("../db/pool.js");
    pool = importedPool;
    const ownerAgent = await login(app, "invitation_owner", password);
    const managerAgent = await login(app, "invitation_manager", password);
    const viewerAgent = await login(app, "invitation_viewer", password);

    await t.test("owner crea una invitación: se guarda solo SHA-256 y la ruta se expone una vez", async () => {
      const response = await post(ownerAgent, "/api/members/invitations", {
        email: "Nueva.Invitacion@Example.Test ",
        offeredRole: "manager"
      }, 201);
      const { invitation, acceptancePath } = response.body.data;
      const token = acceptancePath.split("/").at(-1);
      assert.equal(invitation.email, "nueva.invitacion@example.test");
      assert.equal(invitation.offeredRole, "manager");
      assert.equal(invitation.status, "pending");
      assert.equal(Object.hasOwn(invitation, "tokenHash"), false);
      const stored = await client.query(
        "SELECT token_hash, expires_at FROM business_invitations WHERE id = $1 AND business_id = $2",
        [invitation.id, owner.business_id]
      );
      assert.equal(stored.rows[0].token_hash, crypto.createHash("sha256").update(token).digest("hex"));
      assert.match(stored.rows[0].token_hash, /^[a-f0-9]{64}$/);
      assert.ok(new Date(stored.rows[0].expires_at) > new Date());
      const listing = await ownerAgent.get("/api/members").expect(200);
      assert.equal(JSON.stringify(listing.body).includes(token), false);
      assert.equal(JSON.stringify(listing.body).includes(stored.rows[0].token_hash), false);
    });

    await t.test("conserva puntos internos y distingue correos completos", async () => {
      const dotted = await post(ownerAgent, "/api/members/invitations", {
        email: "  Dev.3CuartosAg@gmail.com  ",
        offeredRole: "viewer"
      }, 201);
      const plain = await post(ownerAgent, "/api/members/invitations", {
        email: "dev3cuartosag@gmail.com",
        offeredRole: "viewer"
      }, 201);

      assert.equal(dotted.body.data.invitation.email, "dev.3cuartosag@gmail.com");
      assert.equal(plain.body.data.invitation.email, "dev3cuartosag@gmail.com");
      assert.notEqual(dotted.body.data.invitation.id, plain.body.data.invitation.id);

      const stored = await client.query(
        `SELECT email_normalized
         FROM business_invitations
         WHERE business_id = $1
           AND email_normalized IN ($2, $3)
           AND status = 'pending'
         ORDER BY email_normalized`,
        [owner.business_id, "dev.3cuartosag@gmail.com", "dev3cuartosag@gmail.com"]
      );
      assert.deepEqual(stored.rows.map((row) => row.email_normalized), [
        "dev.3cuartosag@gmail.com",
        "dev3cuartosag@gmail.com"
      ]);
    });

    await t.test("una segunda invitación sustituye transaccionalmente la pendiente anterior", async () => {
      const first = await post(ownerAgent, "/api/members/invitations", { email: "reemplazo@example.test", offeredRole: "viewer" }, 201);
      const second = await post(ownerAgent, "/api/members/invitations", { email: "reemplazo@example.test", offeredRole: "manager" }, 201);
      const rows = await client.query(
        `SELECT id, status, offered_role FROM business_invitations
         WHERE business_id = $1 AND email_normalized = $2 ORDER BY id`,
        [owner.business_id, "reemplazo@example.test"]
      );
      assert.equal(rows.rows.filter((row) => row.status === "pending").length, 1);
      assert.equal(rows.rows.find((row) => row.id === first.body.data.invitation.id).status, "revoked");
      assert.equal(rows.rows.find((row) => row.id === second.body.data.invitation.id).offered_role, "manager");
    });

    await t.test("revocar funciona y estados no pendientes no cambian", async () => {
      const created = await post(ownerAgent, "/api/members/invitations", { email: "revocar@example.test", offeredRole: "viewer" }, 201);
      const invitationId = created.body.data.invitation.id;
      const revoked = await post(ownerAgent, `/api/members/invitations/${invitationId}/revoke`, {}, 200);
      assert.equal(revoked.body.data.invitation.status, "revoked");
      const repeated = await post(ownerAgent, `/api/members/invitations/${invitationId}/revoke`, {}, 409);
      assert.equal(repeated.body.error.code, "INVITATION_NOT_PENDING");
      const accepted = (await client.query(
        `INSERT INTO business_invitations(business_id, email_normalized, offered_role, token_hash, invited_by, status, accepted_at)
         VALUES($1, 'aceptada-revocar@example.test', 'viewer', repeat('b', 64), $2, 'accepted', CURRENT_TIMESTAMP) RETURNING id`,
        [owner.business_id, owner.id]
      )).rows[0];
      await post(ownerAgent, `/api/members/invitations/${accepted.id}/revoke`, {}, 409);
      const stored = await client.query("SELECT status FROM business_invitations WHERE id = $1", [accepted.id]);
      assert.equal(stored.rows[0].status, "accepted");
    });

    await t.test("roles y entradas inválidas, no owner y recursos ajenos quedan bloqueados", async () => {
      for (const agent of [managerAgent, viewerAgent]) {
        const denied = await post(agent, "/api/members/invitations", { email: "no-autorizado@example.test", offeredRole: "viewer" }, 403);
        assert.equal(denied.body.error.code, "FORBIDDEN");
      }
      const invalidRole = await post(ownerAgent, "/api/members/invitations", { email: "owner-invitado@example.test", offeredRole: "owner" }, 400);
      assert.equal(invalidRole.body.error.code, "VALIDATION_ERROR");
      const invalidEmail = await post(ownerAgent, "/api/members/invitations", { email: "correo-invalido", offeredRole: "viewer" }, 400);
      assert.equal(invalidEmail.body.error.code, "VALIDATION_ERROR");
      const memberAlreadyActive = await post(ownerAgent, "/api/members/invitations", { email: activeMember.email, offeredRole: "viewer" }, 409);
      assert.equal(memberAlreadyActive.body.error.code, "INVITATION_MEMBER_ALREADY_ACTIVE");
      const foreign = await post(ownerAgent, `/api/members/invitations/${foreignInvitation.id}/revoke`, {}, 404);
      assert.equal(foreign.body.error.code, "INVITATION_NOT_FOUND");
      const foreignStored = await client.query("SELECT status FROM business_invitations WHERE id = $1", [foreignInvitation.id]);
      assert.equal(foreignStored.rows[0].status, "pending");
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
