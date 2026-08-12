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

async function apiLogin(app, identifier, password) {
  const agent = request.agent(app);
  const token = await csrfToken(agent);
  await agent
    .post("/api/auth/login")
    .set("x-csrf-token", token)
    .send({ identifier, password })
    .expect(200);
  return agent;
}

test(
  "negocios, selección y logout de API",
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

      const password = "api-business-password";
      const passwordHash = await bcrypt.hash(password, 10);
      const ownerResult = await client.query(
        `
          SELECT users.id, businesses.id AS main_business_id
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
      const owner = ownerResult.rows[0];
      assert.ok(owner);
      await client.query(
        "UPDATE users SET username = $1, email = $2, password_hash = $3 WHERE id = $4",
        ["api_business_owner", "api-business-owner@example.test", passwordHash, owner.id]
      );

      const additionalBusiness = await client.query(
        `
          INSERT INTO businesses (name, slug, created_by, status)
          VALUES ($1, $2, $3, 'active')
          RETURNING id
        `,
        ["Segundo negocio API", "segundo-negocio-api", owner.id]
      );
      const secondBusinessId = additionalBusiness.rows[0].id;
      await client.query(
        `
          INSERT INTO business_members (business_id, user_id, role, status)
          VALUES ($1, $2, 'manager', 'active')
        `,
        [secondBusinessId, owner.id]
      );

      const inactiveBusiness = await client.query(
        `
          INSERT INTO businesses (name, slug, created_by, status)
          VALUES ($1, $2, $3, 'suspended')
          RETURNING id
        `,
        ["Negocio suspendido API", "negocio-suspendido-api", owner.id]
      );
      const suspendedBusinessId = inactiveBusiness.rows[0].id;
      const foreignUser = await client.query(
        `
          INSERT INTO users (username, email, password_hash, platform_role)
          VALUES ($1, $2, $3, 'user')
          RETURNING id
        `,
        ["api_foreign_owner", "api-foreign-owner@example.test", passwordHash]
      );
      const foreignBusiness = await client.query(
        `
          INSERT INTO businesses (name, slug, created_by, status)
          VALUES ($1, $2, $3, 'active')
          RETURNING id
        `,
        ["Negocio ajeno API", "negocio-ajeno-api", foreignUser.rows[0].id]
      );
      const foreignBusinessId = foreignBusiness.rows[0].id;
      await client.query(
        `
          INSERT INTO business_members (business_id, user_id, role, status)
          VALUES
            ($1, $2, 'owner', 'active'),
            ($3, $4, 'viewer', 'suspended')
        `,
        [foreignBusinessId, foreignUser.rows[0].id, suspendedBusinessId, owner.id]
      );

      const { default: app } = await import("../app.js");
      const { default: importedPool } = await import("../db/pool.js");
      pool = importedPool;

      await t.test("usuario anónimo recibe 401 AUTH_REQUIRED", async () => {
        const response = await request(app)
          .get("/api/businesses")
          .expect(401)
          .expect("Content-Type", /application\/json/)
          .expect("Cache-Control", "no-store");

        assert.equal(response.body.error.code, "AUTH_REQUIRED");
      });

      const agent = await apiLogin(app, "api_business_owner", password);

      await t.test("listado devuelve solo negocios y membresías activas del usuario", async () => {
        const response = await agent.get("/api/businesses").expect(200);
        const ids = response.body.data.map((business) => business.id).sort((a, b) => a - b);

        assert.deepEqual(ids, [owner.main_business_id, secondBusinessId].sort((a, b) => a - b));
        assert.equal(response.body.data.some((business) => business.id === suspendedBusinessId), false);
        assert.equal(response.body.data.some((business) => business.id === foreignBusinessId), false);
        assert.deepEqual(Object.keys(response.body.data[0]).sort(), [
          "currency",
          "id",
          "name",
          "role",
          "slug",
          "timezone"
        ]);
      });

      await t.test("selección válida persiste y aparece en la sesión", async () => {
        const token = await csrfToken(agent);
        const selected = await agent
          .put("/api/session/active-business")
          .set("x-csrf-token", token)
          .send({ businessId: secondBusinessId })
          .expect(200);

        assert.equal(selected.body.data.activeBusiness.id, secondBusinessId);
        assert.deepEqual(selected.body.data.membership, { role: "manager", status: "active" });
        assert.deepEqual(selected.body.data.permissions, {
          canManageInventory: true,
          canDeleteInventory: false,
          canManageMembers: false,
          isSuperAdmin: true
        });

        const session = await agent.get("/api/session").expect(200);
        assert.equal(session.body.data.activeBusiness.id, secondBusinessId);
        assert.deepEqual(session.body.data.permissions, selected.body.data.permissions);
      });

      await t.test("selección ajena no cambia sesión y logout la destruye", async () => {
        const token = await csrfToken(agent);
        const rejected = await agent
          .put("/api/session/active-business")
          .set("x-csrf-token", token)
          .send({ businessId: foreignBusinessId })
          .expect(404);

        assert.equal(rejected.body.error.code, "BUSINESS_NOT_FOUND");
        const unchanged = await agent.get("/api/session").expect(200);
        assert.equal(unchanged.body.data.activeBusiness.id, secondBusinessId);

        const logoutToken = await csrfToken(agent);
        await agent
          .post("/api/auth/logout")
          .set("x-csrf-token", logoutToken)
          .expect(204);

        const loggedOut = await agent.get("/api/session").expect(200);
        assert.equal(loggedOut.body.data.authenticated, false);
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
