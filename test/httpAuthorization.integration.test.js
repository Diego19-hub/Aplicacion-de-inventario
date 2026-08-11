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

function extractCsrfToken(html) {
  const match = html.match(
    /<input\s+[^>]*name=["']_csrf["'][^>]*value=["']([^"']+)["'][^>]*>/i
  );

  assert.ok(match, "La página de login debe incluir el campo oculto _csrf.");
  return match[1];
}

async function login(app, identifier, password) {
  const agent = request.agent(app);
  const loginPage = await agent.get("/auth/login").expect(200);
  const csrfToken = extractCsrfToken(loginPage.text);

  await agent
    .post("/auth/login")
    .type("form")
    .send({ _csrf: csrfToken, identifier, password })
    .expect(302);

  return agent;
}

test(
  "autorización HTTP por plataforma y membresía",
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

      const password = "valid-integration-password";
      const [ownerHash, managerHash, viewerHash, outsiderHash] = await Promise.all([
        bcrypt.hash(password, 10),
        bcrypt.hash(password, 10),
        bcrypt.hash(password, 10),
        bcrypt.hash(password, 10)
      ]);

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
      assert.ok(owner);

      await client.query(
        `
          UPDATE users
          SET username = $1, email = $2, password_hash = $3
          WHERE id = $4
        `,
        ["http_owner", "http-owner@example.test", ownerHash, owner.id]
      );

      const usersResult = await client.query(
        `
          INSERT INTO users (username, email, password_hash, platform_role)
          VALUES
            ($1, $2, $3, 'user'),
            ($4, $5, $6, 'user'),
            ($7, $8, $9, 'user')
          RETURNING id, username
        `,
        [
          "http_manager",
          "http-manager@example.test",
          managerHash,
          "http_viewer",
          "http-viewer@example.test",
          viewerHash,
          "http_outsider",
          "http-outsider@example.test",
          outsiderHash
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
            ($1, $3, 'viewer', 'active')
        `,
        [owner.business_id, users.http_manager, users.http_viewer]
      );

      const { default: app } = await import("../app.js");
      const { default: importedPool } = await import("../db/pool.js");
      pool = importedPool;

      await t.test("anónimos se redirigen al login", async () => {
        await request(app).get("/admin").expect(302).expect("Location", "/auth/login");
        await request(app).get("/items").expect(302).expect("Location", "/auth/login");
      });

      const ownerAgent = await login(app, "http_owner", password);
      const managerAgent = await login(app, "http_manager", password);
      const viewerAgent = await login(app, "http_viewer", password);
      const outsiderAgent = await login(app, "http_outsider", password);

      await t.test("super_admin accede a administración", async () => {
        await ownerAgent.get("/admin").expect(200);
      });

      await t.test("manager y viewer reciben 403 en administración", async () => {
        await managerAgent.get("/admin").expect(403);
        await viewerAgent.get("/admin").expect(403);
      });

      await t.test("roles activos pueden consultar productos", async () => {
        await ownerAgent.get("/items").expect(200);
        await managerAgent.get("/items").expect(200);
        await viewerAgent.get("/items").expect(200);
      });

      await t.test("solo owner y manager acceden al formulario de producto", async () => {
        await ownerAgent.get("/items/new").expect(200);
        await managerAgent.get("/items/new").expect(200);
        await viewerAgent.get("/items/new").expect(403);
      });

      await t.test("solo owner consulta productos archivados", async () => {
        await ownerAgent.get("/items/archived").expect(200);
        await managerAgent.get("/items/archived").expect(403);
        await viewerAgent.get("/items/archived").expect(403);
      });

      await t.test("un usuario sin membresía no accede al inventario", async () => {
        await outsiderAgent.get("/items").expect(302).expect("Location", "/businesses/select");
      });

      await t.test("un POST sin CSRF no crea productos", async () => {
        const beforeResult = await client.query("SELECT count(*) FROM items");

        await ownerAgent
          .post("/items/new")
          .type("form")
          .send({
            sku: "HTTP-POST-001",
            name: "Producto que no debe crearse",
            description: "Prueba de protección CSRF",
            brand: "Prueba",
            price: "10.00",
            categoryId: "1"
          })
          .expect(403);

        const afterResult = await client.query("SELECT count(*) FROM items");
        assert.equal(afterResult.rows[0].count, beforeResult.rows[0].count);
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
