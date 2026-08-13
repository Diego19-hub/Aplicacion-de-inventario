import test from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcrypt";
import pg from "pg";
import request from "supertest";

import { createTestDatabase, dropTestDatabase } from "./helpers/testDatabase.js";
import { hashInvitationToken } from "../utils/invitationToken.js";

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

async function createUser(client, username, email, passwordHash) {
  const result = await client.query(
    "INSERT INTO users(username, email, password_hash, platform_role) VALUES ($1, $2, $3, 'user') RETURNING id",
    [username, email, passwordHash]
  );
  return result.rows[0];
}

async function createInvitation(client, { businessId, invitedBy, email, role, token, expiresAt = "CURRENT_TIMESTAMP + INTERVAL '1 day'" }) {
  await client.query(
    `INSERT INTO business_invitations (business_id, email_normalized, offered_role, token_hash, invited_by, expires_at)
     VALUES ($1, $2, $3, $4, $5, ${expiresAt})`,
    [businessId, email, role, hashInvitationToken(token), invitedBy]
  );
}

test("consulta y aceptación API de invitaciones", { skip: !hasTestDatabaseUrl }, async (t) => {
  let client;
  let pool;
  let databaseCreated = false;

  try {
    process.env.NODE_ENV = "test";
    process.env.SESSION_SECRET = "invitation-acceptance-test-secret";
    await createTestDatabase();
    databaseCreated = true;
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    client = new Client({ connectionString: process.env.TEST_DATABASE_URL });
    await client.connect();

    const password = "invitation-acceptance-password";
    const passwordHash = await bcrypt.hash(password, 10);
    const owner = (await client.query(
      `SELECT u.id, b.id AS business_id
       FROM users u
       INNER JOIN business_members bm ON bm.user_id = u.id
       INNER JOIN businesses b ON b.id = bm.business_id
       WHERE u.platform_role = 'super_admin' AND bm.role = 'owner'
       LIMIT 1`
    )).rows[0];
    assert.ok(owner);
    await client.query(
      "UPDATE users SET username = $1, email = $2, password_hash = $3 WHERE id = $4",
      ["invite_owner", "invite-owner@example.test", passwordHash, owner.id]
    );

    const acceptedUser = await createUser(client, "invite_match", "invite-match@example.test", passwordHash);
    const mismatchUser = await createUser(client, "invite_other", "invite-other@example.test", passwordHash);
    await createUser(client, "invite_expired", "invite-expired@example.test", passwordHash);
    const suspendedUser = await createUser(client, "invite_suspended", "invite-suspended@example.test", passwordHash);
    const removedUser = await createUser(client, "invite_removed", "invite-removed@example.test", passwordHash);
    await client.query(
      `INSERT INTO business_members (business_id, user_id, role, status)
       VALUES ($1, $2, 'viewer', 'suspended'), ($1, $3, 'manager', 'removed')`,
      [owner.business_id, suspendedUser.id, removedUser.id]
    );

    const tokens = {
      valid: "a".repeat(64),
      expired: "b".repeat(64),
      mismatch: "c".repeat(64),
      suspended: "d".repeat(64),
      removed: "e".repeat(64)
    };
    await createInvitation(client, { businessId: owner.business_id, invitedBy: owner.id, email: "invite-match@example.test", role: "manager", token: tokens.valid });
    await createInvitation(client, { businessId: owner.business_id, invitedBy: owner.id, email: "invite-target@example.test", role: "viewer", token: tokens.mismatch });
    await createInvitation(client, { businessId: owner.business_id, invitedBy: owner.id, email: "invite-suspended@example.test", role: "manager", token: tokens.suspended });
    await createInvitation(client, { businessId: owner.business_id, invitedBy: owner.id, email: "invite-removed@example.test", role: "viewer", token: tokens.removed });
    await createInvitation(client, {
      businessId: owner.business_id,
      invitedBy: owner.id,
      email: "invite-expired@example.test",
      role: "viewer",
      token: tokens.expired,
      expiresAt: "CURRENT_TIMESTAMP - INTERVAL '1 minute'"
    });

    const { default: app } = await import("../app.js");
    const { default: importedPool } = await import("../db/pool.js");
    pool = importedPool;

    await t.test("consulta válida no expone hashes; vencida e inválida quedan controladas", async () => {
      const valid = await request(app).get(`/api/invitations/${tokens.valid}`).expect(200).expect("Cache-Control", "no-store");
      assert.deepEqual(valid.body.data.invitation.business, { name: "Boxing Inventory", slug: "boxing-inventory" });
      assert.equal(valid.body.data.invitation.email, "invite-match@example.test");
      assert.equal(valid.body.data.invitation.isExpired, false);
      assert.equal(JSON.stringify(valid.body).includes("token_hash"), false);

      const expired = await request(app).get(`/api/invitations/${tokens.expired}`).expect(200);
      assert.equal(expired.body.data.invitation.isExpired, true);
      const expiredAgent = await login(app, "invite_expired", password);
      const expiredAcceptance = await expiredAgent
        .post(`/api/invitations/${tokens.expired}/accept`)
        .set("x-csrf-token", await csrfToken(expiredAgent))
        .expect(410);
      assert.equal(expiredAcceptance.body.error.code, "INVITATION_EXPIRED");
      await request(app).get(`/api/invitations/${"f".repeat(64)}`).expect(404);
    });

    await t.test("sin sesión se rechaza y un correo distinto no consume la invitación", async () => {
      const anonymous = request.agent(app);
      await anonymous.post(`/api/invitations/${tokens.valid}/accept`).set("x-csrf-token", await csrfToken(anonymous)).expect(401);
      const mismatchAgent = await login(app, "invite_other", password);
      const mismatch = await mismatchAgent.post(`/api/invitations/${tokens.mismatch}/accept`).set("x-csrf-token", await csrfToken(mismatchAgent)).expect(403);
      assert.equal(mismatch.body.error.code, "INVITATION_EMAIL_MISMATCH");
      const status = await client.query("SELECT status FROM business_invitations WHERE token_hash = $1", [hashInvitationToken(tokens.mismatch)]);
      assert.equal(status.rows[0].status, "pending");
    });

    await t.test("el correo correcto acepta una vez y selecciona el negocio", async () => {
      const agent = await login(app, "invite_match", password);
      const lookup = await agent.get(`/api/invitations/${tokens.valid}`).expect(200);
      assert.equal(lookup.body.data.session.emailMatches, true);
      const accepted = await agent.post(`/api/invitations/${tokens.valid}/accept`).set("x-csrf-token", await csrfToken(agent)).expect(200);
      assert.equal(accepted.body.data.membership.role, "manager");
      assert.equal(accepted.body.data.membership.status, "active");
      assert.equal(accepted.body.data.permissions.canManageInventory, true);
      assert.equal(accepted.body.data.permissions.canDeleteInventory, false);

      const membership = await client.query(
        "SELECT role, status FROM business_members WHERE business_id = $1 AND user_id = $2",
        [owner.business_id, acceptedUser.id]
      );
      assert.deepEqual(membership.rows, [{ role: "manager", status: "active" }]);
      const invitation = await client.query(
        "SELECT status, accepted_at FROM business_invitations WHERE token_hash = $1",
        [hashInvitationToken(tokens.valid)]
      );
      assert.equal(invitation.rows[0].status, "accepted");
      assert.ok(invitation.rows[0].accepted_at);
      const session = await agent.get("/api/session").expect(200);
      assert.equal(session.body.data.activeBusiness.id, owner.business_id);
      assert.deepEqual(session.body.data.membership, { role: "manager", status: "active" });
      await agent.post(`/api/invitations/${tokens.valid}/accept`).set("x-csrf-token", await csrfToken(agent)).expect(404);
    });

    await t.test("membresías suspendida y removida se reactivan sin duplicar ni alterar owner", async () => {
      for (const [identifier, token, expectedRole, user] of [
        ["invite_suspended", tokens.suspended, "manager", suspendedUser],
        ["invite_removed", tokens.removed, "viewer", removedUser]
      ]) {
        const agent = await login(app, identifier, password);
        await agent.post(`/api/invitations/${token}/accept`).set("x-csrf-token", await csrfToken(agent)).expect(200);
        const membership = await client.query(
          "SELECT role, status, COUNT(*) OVER ()::INTEGER AS total FROM business_members WHERE business_id = $1 AND user_id = $2",
          [owner.business_id, user.id]
        );
        assert.deepEqual(membership.rows[0], { role: expectedRole, status: "active", total: 1 });
      }
      const ownerMembership = await client.query(
        "SELECT role, status FROM business_members WHERE business_id = $1 AND user_id = $2",
        [owner.business_id, owner.id]
      );
      assert.deepEqual(ownerMembership.rows, [{ role: "owner", status: "active" }]);
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
