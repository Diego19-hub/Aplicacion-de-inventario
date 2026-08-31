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
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
}

async function login(app, identifier, password) {
  const agent = request.agent(app);
  const csrfToken = (await agent.get("/api/csrf-token").expect(200)).body.data.csrfToken;
  await agent.post("/api/auth/login").set("x-csrf-token", csrfToken).send({ identifier, password }).expect(200);

  return agent;
}

const anonymousSession = {
  authenticated: false,
  user: null,
  activeBusiness: null,
  membership: null,
  permissions: {
    canManageInventory: false,
    canDeleteInventory: false,
    canManageMembers: false,
    canManageCustomers: false,
    canManageCustomerCharges: false,
    canRegisterCustomerPayments: false,
    canCancelCustomerPayments: false,
    canViewCustomerCollections: false,
    isSuperAdmin: false
  }
};

test(
  "API de token CSRF y sesión",
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

      const password = "api-session-integration-password";
      const passwordHash = await bcrypt.hash(password, 10);
      const ownerResult = await client.query(
        `
          SELECT users.id, businesses.id AS business_id
          FROM users
          INNER JOIN business_members
            ON business_members.user_id = users.id
          INNER JOIN businesses
            ON businesses.id = business_members.business_id
          WHERE users.platform_role = 'super_admin'
            AND business_members.role = 'owner'
            AND business_members.status = 'active'
            AND businesses.status = 'active'
          LIMIT 1
        `
      );
      const owner = ownerResult.rows[0];
      assert.ok(owner, "El fixture base debe proporcionar un owner activo.");

      await client.query(
        `
          UPDATE users
          SET username = $1, email = $2, password_hash = $3
          WHERE id = $4
        `,
        ["api_owner", "api-owner@example.test", passwordHash, owner.id]
      );

      const usersResult = await client.query(
        `
          INSERT INTO users (username, email, password_hash, platform_role)
          VALUES
            ($1, $2, $3, 'user'),
            ($4, $5, $3, 'user'),
            ($6, $7, $3, 'user'),
            ($8, $9, $3, 'user')
          RETURNING id, username
        `,
        [
          "api_manager",
          "api-manager@example.test",
          passwordHash,
          "api_viewer",
          "api-viewer@example.test",
          "api_without_business",
          "api-without-business@example.test",
          "api_suspended_member",
          "api-suspended-member@example.test"
        ]
      );
      const users = Object.fromEntries(
        usersResult.rows.map((user) => [user.username, user.id])
      );

      await client.query(
        `
          INSERT INTO business_members (business_id, user_id, role, status)
          VALUES
            ($1, $2, 'manager', 'active'),
            ($1, $3, 'viewer', 'active'),
            ($1, $4, 'viewer', 'active')
        `,
        [
          owner.business_id,
          users.api_manager,
          users.api_viewer,
          users.api_suspended_member
        ]
      );

      const { default: app } = await import("../app.js");
      const { default: importedPool } = await import("../db/pool.js");
      pool = importedPool;

      await t.test("CSRF responde JSON sin caché y conserva la sesión del agente", async () => {
        const agent = request.agent(app);
        const first = await agent
          .get("/api/csrf-token")
          .expect(200)
          .expect("Content-Type", /application\/json/)
          .expect("Cache-Control", "no-store");
        const second = await agent
          .get("/api/csrf-token")
          .expect(200)
          .expect("Content-Type", /application\/json/)
          .expect("Cache-Control", "no-store");

        assert.equal(typeof first.body.data.csrfToken, "string");
        assert.ok(first.body.data.csrfToken.length > 0);
        assert.equal(typeof second.body.data.csrfToken, "string");
        assert.ok(second.body.data.csrfToken.length > 0);
      });

      await t.test("sesión anónima respeta exactamente el contrato", async () => {
        const response = await request(app)
          .get("/api/session")
          .expect(200)
          .expect("Content-Type", /application\/json/)
          .expect("Cache-Control", "no-store");

        assert.deepEqual(response.body, { data: anonymousSession });
      });

      const ownerAgent = await login(app, "api_owner", password);
      const managerAgent = await login(app, "api_manager", password);
      const viewerAgent = await login(app, "api_viewer", password);
      const noBusinessAgent = await login(app, "api_without_business", password);
      const suspendedMemberAgent = await login(app, "api_suspended_member", password);

      await t.test("usuario autenticado sin negocio recibe datos seguros y nulos", async () => {
        const response = await noBusinessAgent.get("/api/session").expect(200);

        assert.deepEqual(response.body.data.user, {
          id: users.api_without_business,
          username: "api_without_business",
          email: "api-without-business@example.test",
          platformRole: "user"
        });
        assert.equal(response.body.data.activeBusiness, null);
        assert.equal(response.body.data.membership, null);
        assert.deepEqual(response.body.data.permissions, {
          canManageInventory: false,
          canDeleteInventory: false,
          canManageMembers: false,
          canManageCustomers: false,
          canManageCustomerCharges: false,
          canRegisterCustomerPayments: false,
          canCancelCustomerPayments: false,
          canViewCustomerCollections: false,
          isSuperAdmin: false
        });
      });

      for (const [label, agent, role, permissions] of [
        ["owner", ownerAgent, "owner", { canManageInventory: true, canDeleteInventory: true, canManageMembers: true, canManageCustomers: true, canManageCustomerCharges: true, canRegisterCustomerPayments: true, canCancelCustomerPayments: true, canViewCustomerCollections: true, isSuperAdmin: true }],
        ["manager", managerAgent, "manager", { canManageInventory: true, canDeleteInventory: false, canManageMembers: false, canManageCustomers: true, canManageCustomerCharges: true, canRegisterCustomerPayments: true, canCancelCustomerPayments: false, canViewCustomerCollections: true, isSuperAdmin: false }],
        ["viewer", viewerAgent, "viewer", { canManageInventory: false, canDeleteInventory: false, canManageMembers: false, canManageCustomers: false, canManageCustomerCharges: false, canRegisterCustomerPayments: false, canCancelCustomerPayments: false, canViewCustomerCollections: true, isSuperAdmin: false }]
      ]) {
        await t.test(`${label} activo recibe permisos calculados en el servidor`, async () => {
          const response = await agent.get("/api/session").expect(200);

          assert.equal(response.body.data.authenticated, true);
          assert.equal(response.body.data.activeBusiness.id, owner.business_id);
          assert.deepEqual(response.body.data.membership, { role, status: "active" });
          assert.deepEqual(response.body.data.permissions, permissions);
        });
      }

      await t.test("membresía suspendida limpia el negocio activo", async () => {
        await client.query(
          `
            UPDATE business_members
            SET status = 'suspended'
            WHERE business_id = $1 AND user_id = $2
          `,
          [owner.business_id, users.api_suspended_member]
        );

        const response = await suspendedMemberAgent.get("/api/session").expect(200);
        assert.equal(response.body.data.activeBusiness, null);
        assert.equal(response.body.data.membership, null);

        const persisted = await suspendedMemberAgent.get("/api/session").expect(200);
        assert.equal(persisted.body.data.activeBusiness, null);
        assert.equal(persisted.body.data.membership, null);
      });

      await t.test("negocio suspendido limpia el negocio activo", async () => {
        await client.query("UPDATE businesses SET status = 'suspended' WHERE id = $1", [owner.business_id]);

        const response = await ownerAgent.get("/api/session").expect(200);
        assert.equal(response.body.data.activeBusiness, null);
        assert.equal(response.body.data.membership, null);

        const persisted = await ownerAgent.get("/api/session").expect(200);
        assert.equal(persisted.body.data.activeBusiness, null);
        assert.equal(persisted.body.data.membership, null);
      });

      await t.test("la respuesta no expone campos internos ni secretos", async () => {
        const response = await managerAgent.get("/api/session").expect(200);
        const serialized = JSON.stringify(response.body);

        assert.equal(serialized.includes("password_hash"), false);
        assert.equal(serialized.includes(passwordHash), false);
        assert.equal(serialized.includes("session-secret"), false);
        assert.deepEqual(Object.keys(response.body.data.user).sort(), [
          "email",
          "id",
          "platformRole",
          "username"
        ]);
      });

      await t.test("errores controlados de API permanecen en JSON", async () => {
        const response = await request(app)
          .get("/api/no-existe")
          .expect(404)
          .expect("Content-Type", /application\/json/);

        assert.deepEqual(response.body, {
          error: {
            code: "RESOURCE_NOT_FOUND",
            message: "Recurso no encontrado."
          }
        });
      });

      await t.test("las rutas EJS retiradas permanecen inexistentes", async () => {
        await request(app).get("/auth/login").expect(404);
        await request(app).get("/items").expect(404);
      });
    } finally {
      if (client) {
        await client.end();
      }

      if (pool) {
        await pool.end();
      }

      if (originalEnvironment.DATABASE_URL === undefined) {
        delete process.env.DATABASE_URL;
      } else {
        process.env.DATABASE_URL = originalEnvironment.DATABASE_URL;
      }

      if (databaseCreated) {
        await dropTestDatabase();
      }

      restoreEnvironment();
    }
  }
);
