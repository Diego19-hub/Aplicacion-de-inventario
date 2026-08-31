import test from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcrypt";
import pg from "pg";
import request from "supertest";

import { createTestDatabase, dropTestDatabase, withTestTransaction } from "./helpers/testDatabase.js";

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
  await agent
    .post("/api/auth/login")
    .set("x-csrf-token", token)
    .send({ identifier, password })
    .expect(200);
  return agent;
}

async function mutate(agent, method, path, body, expectedStatus) {
  const token = await csrfToken(agent);
  return agent[method](path)
    .set("x-csrf-token", token)
    .send(body)
    .expect(expectedStatus);
}

test("creación y edición de categorías mediante API", { skip: !hasTestDatabaseUrl }, async (t) => {
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

    const password = "api-category-mutations-password";
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
      ["category_mutation_owner", "category-mutation-owner@example.test", passwordHash, owner.id]
    );
    const manager = (await client.query(
      "INSERT INTO users(username, email, password_hash, platform_role) VALUES($1, $2, $3, 'user') RETURNING id",
      ["category_mutation_manager", "category-mutation-manager@example.test", passwordHash]
    )).rows[0];
    const viewer = (await client.query(
      "INSERT INTO users(username, email, password_hash, platform_role) VALUES($1, $2, $3, 'user') RETURNING id",
      ["category_mutation_viewer", "category-mutation-viewer@example.test", passwordHash]
    )).rows[0];
    await client.query(
      `INSERT INTO business_members(business_id, user_id, role, status)
       VALUES($1, $2, 'manager', 'active'), ($1, $3, 'viewer', 'active')`,
      [owner.business_id, manager.id, viewer.id]
    );

    const existing = (await client.query(
      "INSERT INTO categories(name, description, business_id) VALUES($1, $2, $3) RETURNING id",
      ["Categoría duplicada", "Categoría existente", owner.business_id]
    )).rows[0];
    const foreignUser = (await client.query(
      "INSERT INTO users(username, email, password_hash, platform_role) VALUES($1, $2, $3, 'user') RETURNING id",
      ["category_mutation_foreign", "category-mutation-foreign@example.test", passwordHash]
    )).rows[0];
    const foreignBusiness = await withTestTransaction(client, async () => {
      const business = (await client.query("INSERT INTO businesses(name, slug, created_by, status) VALUES($1, $2, $3, 'active') RETURNING id", ["Negocio ajeno mutaciones", "negocio-ajeno-mutaciones", foreignUser.id])).rows[0];
      await client.query("INSERT INTO business_members(business_id, user_id, role, status) VALUES($1, $2, 'owner', 'active')", [business.id, foreignUser.id]);
      await client.query("INSERT INTO categories(business_id, name, description, is_default) VALUES($1, 'General', 'Categoría predeterminada', true)", [business.id]);
      return business;
    });
    const foreignCategory = (await client.query(
      "INSERT INTO categories(name, description, business_id) VALUES($1, $2, $3) RETURNING id",
      ["Categoría ajena", "Categoría de otro negocio", foreignBusiness.id]
    )).rows[0];
    await client.query(
      "INSERT INTO categories(name, description, business_id) VALUES($1, $2, $3)",
      ["Nombre compartido", "Existe solo en otro negocio", foreignBusiness.id]
    );

    const { default: app } = await import("../app.js");
    const { default: importedPool } = await import("../db/pool.js");
    pool = importedPool;
    const ownerAgent = await login(app, "category_mutation_owner", password);
    const managerAgent = await login(app, "category_mutation_manager", password);
    const viewerAgent = await login(app, "category_mutation_viewer", password);

    await t.test("owner crea y manager actualiza dentro del negocio", async () => {
      const created = await mutate(ownerAgent, "post", "/api/categories", {
        name: "Categoría nueva API",
        description: ""
      }, 201);
      assert.equal(created.body.data.category.description, "");
      const categoryId = created.body.data.category.id;
      const edit = await managerAgent.get(`/api/categories/${categoryId}/edit`).expect(200).expect("Cache-Control", "no-store");
      assert.equal(edit.body.data.category.name, "Categoría nueva API");
      const updated = await mutate(managerAgent, "put", `/api/categories/${categoryId}`, {
        name: "Categoría renombrada API",
        description: "Descripción actualizada para la categoría"
      }, 200);
      assert.deepEqual(updated.body.data.category, {
        id: categoryId,
        name: "Categoría renombrada API",
        description: "Descripción actualizada para la categoría",
        isDefault: false
      });
      const formOptions = await managerAgent.get("/api/products/form-options").expect(200);
      assert.ok(formOptions.body.data.categories.some((category) => category.id === categoryId && category.name === "Categoría renombrada API"));
    });

    await t.test("viewer recibe 403 y una categoría ajena responde 404", async () => {
      const viewerCreate = await mutate(viewerAgent, "post", "/api/categories", {
        name: "Intento viewer",
        description: ""
      }, 403);
      assert.equal(viewerCreate.body.error.code, "FORBIDDEN");
      const viewerUpdate = await mutate(viewerAgent, "put", `/api/categories/${existing.id}`, {
        name: "No debe cambiar",
        description: ""
      }, 403);
      assert.equal(viewerUpdate.body.error.code, "FORBIDDEN");
      const foreign = await mutate(ownerAgent, "put", `/api/categories/${foreignCategory.id}`, {
        name: "No debe tocarse",
        description: ""
      }, 404);
      assert.equal(foreign.body.error.code, "CATEGORY_NOT_FOUND");
    });

    await t.test("duplicados y campos protegidos fallan sin cambios; otro negocio puede compartir nombre", async () => {
      const before = Number((await client.query("SELECT COUNT(*) FROM categories WHERE business_id = $1", [owner.business_id])).rows[0].count);
      const duplicate = await mutate(ownerAgent, "post", "/api/categories", {
        name: "CATEGORÍA DUPLICADA",
        description: ""
      }, 409);
      assert.equal(duplicate.body.error.code, "CATEGORY_ALREADY_EXISTS");
      const protectedField = await mutate(ownerAgent, "post", "/api/categories", {
        name: "Categoría protegida",
        description: "",
        businessId: foreignBusiness.id
      }, 400);
      assert.equal(protectedField.body.error.code, "VALIDATION_ERROR");
      const afterFailed = Number((await client.query("SELECT COUNT(*) FROM categories WHERE business_id = $1", [owner.business_id])).rows[0].count);
      assert.equal(afterFailed, before);
      const sharedName = await mutate(ownerAgent, "post", "/api/categories", {
        name: "Nombre compartido",
        description: ""
      }, 201);
      assert.equal(sharedName.body.data.category.name, "Nombre compartido");
      const stored = await client.query("SELECT business_id FROM categories WHERE id = $1", [sharedName.body.data.category.id]);
      assert.equal(stored.rows[0].business_id, owner.business_id);
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
