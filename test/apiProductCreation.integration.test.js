import test from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcrypt";
import pg from "pg";
import request from "supertest";

import {
  createTestDatabase,
  dropTestDatabase,
  withTestTransaction
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

async function login(app, identifier, password) {
  const agent = request.agent(app);
  const csrfToken = (await agent.get("/api/csrf-token").expect(200)).body.data.csrfToken;
  await agent
    .post("/api/auth/login")
    .set("x-csrf-token", csrfToken)
    .send({ identifier, password })
    .expect(200);
  return agent;
}

async function csrfToken(agent) {
  return (await agent.get("/api/csrf-token").expect(200)).body.data.csrfToken;
}

test("POST /api/products", { skip: !hasTestDatabaseUrl }, async (t) => {
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

    const password = "api-product-create-password";
    const passwordHash = await bcrypt.hash(password, 10);
    const owner = (await client.query(
      `SELECT u.id, b.id AS business_id
       FROM users u
       INNER JOIN business_members bm ON bm.user_id = u.id
       INNER JOIN businesses b ON b.id = bm.business_id
       WHERE u.platform_role = 'super_admin'
         AND bm.role = 'owner'
         AND bm.status = 'active'
         AND b.status = 'active'
       LIMIT 1`
    )).rows[0];
    assert.ok(owner);
    await client.query(
      "UPDATE users SET username = $1, email = $2, password_hash = $3 WHERE id = $4",
      ["creation_owner", "creation-owner@example.test", passwordHash, owner.id]
    );

    const category = (await client.query(
      "INSERT INTO categories(name, description, business_id) VALUES($1, $2, $3) RETURNING id, name",
      ["Catálogo general", "Categoría para creación", owner.business_id]
    )).rows[0];

    const viewer = (await client.query(
      "INSERT INTO users(username, email, password_hash, platform_role) VALUES($1, $2, $3, 'user') RETURNING id",
      ["creation_viewer", "creation-viewer@example.test", passwordHash]
    )).rows[0];
    await client.query(
      "INSERT INTO business_members(business_id, user_id, role, status) VALUES($1, $2, 'viewer', 'active')",
      [owner.business_id, viewer.id]
    );

    const foreignUser = (await client.query(
      "INSERT INTO users(username, email, password_hash, platform_role) VALUES($1, $2, $3, 'user') RETURNING id",
      ["creation_foreign", "creation-foreign@example.test", passwordHash]
    )).rows[0];
    const foreignBusiness = await withTestTransaction(client, async () => {
      const business = (await client.query("INSERT INTO businesses(name, slug, created_by, status) VALUES($1, $2, $3, 'active') RETURNING id", ["Negocio ajeno creación", "negocio-ajeno-creacion", foreignUser.id])).rows[0];
      await client.query("INSERT INTO business_members(business_id, user_id, role, status) VALUES($1, $2, 'owner', 'active')", [business.id, foreignUser.id]);
      await client.query("INSERT INTO categories(business_id, name, description, is_default) VALUES($1, 'General', 'Categoría predeterminada', true)", [business.id]);
      return business;
    });
    const foreignCategory = (await client.query(
      "INSERT INTO categories(name, description, business_id) VALUES($1, $2, $3) RETURNING id",
      ["Categoría ajena creación", "Categoría ajena", foreignBusiness.id]
    )).rows[0];

    const { default: app } = await import("../app.js");
    const { default: importedPool } = await import("../db/pool.js");
    pool = importedPool;
    const ownerAgent = await login(app, "creation_owner", password);

    await t.test("owner crea SKU automático, con stock cero y categoría propia", async () => {
      const token = await csrfToken(ownerAgent);
      const response = await ownerAgent
        .post("/api/products")
        .set("x-csrf-token", token)
        .send({
          name: "Producto automático",
          description: "Descripción suficientemente extensa para crear el producto.",
          brand: "Marca automática",
          price: 125.5,
          categoryId: category.id,
          sku: ""
        })
        .expect(201)
        .expect("Cache-Control", "no-store");

      assert.match(response.body.data.product.sku, /^CAT-0001$/);
      assert.equal(response.body.data.product.stock, 0);
      assert.deepEqual(response.body.data.product.category, category);
      const stored = await client.query(
        "SELECT stock, status, business_id FROM items WHERE id = $1",
        [response.body.data.product.id]
      );
      assert.deepEqual(stored.rows[0], { stock: 0, status: "active", business_id: owner.business_id });
    });

    await t.test("SKU manual normalizado se conserva", async () => {
      const token = await csrfToken(ownerAgent);
      const response = await ownerAgent
        .post("/api/products")
        .set("x-csrf-token", token)
        .send({
          name: "Producto manual",
          description: "Descripción suficientemente extensa para SKU manual.",
          brand: "Marca manual",
          price: "20.25",
          categoryId: category.id,
          sku: " manual-001 "
        })
        .expect(201);

      assert.equal(response.body.data.product.sku, "MANUAL-001");
    });

    await t.test("viewer recibe 403 y no crea filas", async () => {
      const viewerAgent = await login(app, "creation_viewer", password);
      const before = Number((await client.query("SELECT COUNT(*) FROM items WHERE business_id = $1", [owner.business_id])).rows[0].count);
      const token = await csrfToken(viewerAgent);
      const response = await viewerAgent
        .post("/api/products")
        .set("x-csrf-token", token)
        .send({ name: "No permitido", description: "Descripción no permitida.", brand: "Marca", price: 1, categoryId: category.id, sku: "VIEW-001" })
        .expect(403);

      assert.equal(response.body.error.code, "FORBIDDEN");
      const after = Number((await client.query("SELECT COUNT(*) FROM items WHERE business_id = $1", [owner.business_id])).rows[0].count);
      assert.equal(after, before);
    });

    await t.test("categoría ajena y SKU duplicado no dejan productos parciales", async () => {
      const before = Number((await client.query("SELECT COUNT(*) FROM items WHERE business_id = $1", [owner.business_id])).rows[0].count);
      let token = await csrfToken(ownerAgent);
      const foreignResponse = await ownerAgent
        .post("/api/products")
        .set("x-csrf-token", token)
        .send({ name: "Categoría ajena", description: "Descripción de categoría ajena.", brand: "Marca ajena", price: 5, categoryId: foreignCategory.id, sku: "AJENA-001" })
        .expect(400);
      assert.equal(foreignResponse.body.error.code, "VALIDATION_ERROR");
      assert.equal(foreignResponse.body.error.fields[0].field, "categoryId");

      token = await csrfToken(ownerAgent);
      const duplicateResponse = await ownerAgent
        .post("/api/products")
        .set("x-csrf-token", token)
        .send({ name: "SKU duplicado", description: "Descripción para SKU duplicado.", brand: "Marca duplicada", price: 7, categoryId: category.id, sku: "manual-001" })
        .expect(409);
      assert.equal(duplicateResponse.body.error.code, "SKU_ALREADY_EXISTS");
      assert.equal(duplicateResponse.body.error.fields[0].field, "sku");

      const after = Number((await client.query("SELECT COUNT(*) FROM items WHERE business_id = $1", [owner.business_id])).rows[0].count);
      assert.equal(after, before);
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
