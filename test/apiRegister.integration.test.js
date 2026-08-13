import test from "node:test";
import assert from "node:assert/strict";
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

async function register(agent, body, expectedStatus) {
  const token = await csrfToken(agent);
  return agent.post("/api/auth/register").set("x-csrf-token", token).send(body).expect(expectedStatus);
}

test("POST /api/auth/register", { skip: !hasTestDatabaseUrl }, async (t) => {
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

    const { default: app } = await import("../app.js");
    const { default: importedPool } = await import("../db/pool.js");
    const { registerAccount } = await import("../services/authenticationService.js");
    pool = importedPool;

    await t.test("registro válido crea usuario normal, regenera sesión y no crea membresías", async () => {
      const agent = request.agent(app);
      const response = await register(agent, {
        username: "react_register_user",
        email: "REACT.REGISTER@EXAMPLE.TEST ",
        password: "registro-seguro",
        passwordConfirmation: "registro-seguro"
      }, 201);
      assert.equal(response.body.data.user.username, "react_register_user");
      assert.equal(response.body.data.user.email, "react.register@example.test");
      assert.equal(response.body.data.user.platformRole, "user");
      assert.deepEqual(response.body.data.businesses, []);
      assert.equal(response.body.data.activeBusiness, null);
      assert.equal(response.body.data.membership, null);
      assert.equal(response.body.data.permissions.canManageInventory, false);
      assert.equal(response.body.data.permissions.canManageMembers, false);
      assert.equal(Object.hasOwn(response.body.data.user, "passwordHash"), false);

      const stored = await client.query(
        "SELECT password_hash, platform_role FROM users WHERE id = $1",
        [response.body.data.user.id]
      );
      assert.equal(stored.rows[0].platform_role, "user");
      assert.notEqual(stored.rows[0].password_hash, "registro-seguro");
      const memberships = await client.query("SELECT COUNT(*)::INTEGER AS count FROM business_members WHERE user_id = $1", [response.body.data.user.id]);
      assert.equal(memberships.rows[0].count, 0);
      const session = await agent.get("/api/session").expect(200);
      assert.deepEqual(session.body.data.user, response.body.data.user);
    });

    await t.test("datos inválidos y campos protegidos no crean usuarios", async () => {
      const before = (await client.query("SELECT COUNT(*)::INTEGER AS count FROM users")).rows[0].count;
      const agent = request.agent(app);
      const invalid = await register(agent, {
        username: "x",
        email: "correo-invalido",
        password: "corta",
        passwordConfirmation: "distinta",
        platformRole: "super_admin"
      }, 400);
      assert.equal(invalid.body.error.code, "VALIDATION_ERROR");
      assert.deepEqual(invalid.body.error.fields.map((field) => field.field).sort(), ["email", "password", "passwordConfirmation", "platformRole", "username"]);
      const after = (await client.query("SELECT COUNT(*)::INTEGER AS count FROM users")).rows[0].count;
      assert.equal(after, before);
    });

    await t.test("duplicados devuelven conflictos controlados y el servicio compartido sigue operativo", async () => {
      const agent = request.agent(app);
      await register(agent, {
        username: "duplicado_react",
        email: "duplicado-react@example.test",
        password: "registro-seguro",
        passwordConfirmation: "registro-seguro"
      }, 201);
      const duplicate = await register(request.agent(app), {
        username: "DUPLICADO_REACT",
        email: "DUPLICADO-REACT@EXAMPLE.TEST",
        password: "registro-seguro",
        passwordConfirmation: "registro-seguro"
      }, 409);
      assert.equal(duplicate.body.error.code, "REGISTRATION_CONFLICT");
      assert.deepEqual(duplicate.body.error.fields.map((field) => field.field).sort(), ["email", "username"]);
      const sharedServiceResult = await registerAccount({
        username: "servicio_ejs_compartido",
        email: "servicio-ejs-compartido@example.test",
        password: "registro-seguro"
      });
      assert.ok(sharedServiceResult.user);
      assert.equal(sharedServiceResult.user.platform_role, "user");
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
