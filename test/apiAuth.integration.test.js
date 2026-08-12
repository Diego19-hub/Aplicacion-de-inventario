import test from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcrypt";
import pg from "pg";
import request from "supertest";

import {
  createTestDatabase,
  dropTestDatabase
} from "./helpers/testDatabase.js";

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
  const response = await agent.get("/api/csrf-token").expect(200);
  return response.body.data.csrfToken;
}

test(
  "POST /api/auth/login",
  { skip: !hasTestDatabaseUrl },
  async (t) => {
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

      const password = "api-login-password";
      const passwordHash = await bcrypt.hash(password, 10);
      const owner = await client.query(
        `
          SELECT users.id, businesses.id AS business_id
          FROM users
          INNER JOIN business_members ON business_members.user_id = users.id
          INNER JOIN businesses ON businesses.id = business_members.business_id
          WHERE users.platform_role = 'super_admin'
            AND business_members.role = 'owner'
            AND business_members.status = 'active'
            AND businesses.status = 'active'
          LIMIT 1
        `
      );
      const user = owner.rows[0];
      assert.ok(user);
      await client.query(
        "UPDATE users SET username = $1, email = $2, password_hash = $3 WHERE id = $4",
        ["api_login_owner", "api-login-owner@example.test", passwordHash, user.id]
      );

      const { default: app } = await import("../app.js");
      const { default: importedPool } = await import("../db/pool.js");
      pool = importedPool;

      await t.test("login correcto crea sesión y /api/session confirma usuario", async () => {
        const agent = request.agent(app);
        const token = await csrfToken(agent);
        const login = await agent
          .post("/api/auth/login")
          .set("x-csrf-token", token)
          .send({ identifier: "api_login_owner", password })
          .expect(200)
          .expect("Content-Type", /application\/json/)
          .expect("Cache-Control", "no-store");

        assert.deepEqual(login.body.data.user, {
          id: user.id,
          username: "api_login_owner",
          email: "api-login-owner@example.test",
          platformRole: "super_admin"
        });
        assert.equal(login.body.data.activeBusiness.id, user.business_id);
        assert.deepEqual(login.body.data.membership, { role: "owner", status: "active" });
        assert.deepEqual(login.body.data.permissions, {
          canManageInventory: true,
          canDeleteInventory: true,
          isSuperAdmin: true
        });
        assert.equal(login.body.data.requiresBusinessSelection, false);

        const session = await agent.get("/api/session").expect(200);
        assert.deepEqual(session.body.data.user, login.body.data.user);
        assert.equal(session.body.data.activeBusiness.id, user.business_id);
      });

      await t.test("credenciales incorrectas devuelven 401", async () => {
        const agent = request.agent(app);
        const token = await csrfToken(agent);
        const response = await agent
          .post("/api/auth/login")
          .set("x-csrf-token", token)
          .send({ identifier: "api_login_owner", password: "contraseña-incorrecta" })
          .expect(401);

        assert.deepEqual(response.body, {
          error: {
            code: "INVALID_CREDENTIALS",
            message: "Usuario, correo o contraseña incorrectos."
          }
        });
      });

      await t.test("entrada inválida devuelve 400 con errores por campo", async () => {
        const agent = request.agent(app);
        const token = await csrfToken(agent);
        const response = await agent
          .post("/api/auth/login")
          .set("x-csrf-token", token)
          .send({ identifier: "", password: "" })
          .expect(400);

        assert.equal(response.body.error.code, "VALIDATION_ERROR");
        assert.deepEqual(
          response.body.error.fields.map((field) => field.field).sort(),
          ["identifier", "password"]
        );
      });

      await t.test("POST sin CSRF válido devuelve 403 y no crea sesión", async () => {
        const agent = request.agent(app);
        const response = await agent
          .post("/api/auth/login")
          .send({ identifier: "api_login_owner", password })
          .expect(403)
          .expect("Content-Type", /application\/json/);

        assert.equal(response.body.error.code, "CSRF_INVALID");

        const session = await agent.get("/api/session").expect(200);
        assert.equal(session.body.data.authenticated, false);
      });
    } finally {
      if (client) await client.end();
      if (pool) await pool.end();

      if (originalEnvironment.DATABASE_URL === undefined) {
        delete process.env.DATABASE_URL;
      } else {
        process.env.DATABASE_URL = originalEnvironment.DATABASE_URL;
      }

      if (databaseCreated) await dropTestDatabase();
      restoreEnvironment();
    }
  }
);
