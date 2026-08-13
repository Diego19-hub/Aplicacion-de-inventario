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
  const response = await agent
    .post("/api/auth/login")
    .set("x-csrf-token", token)
    .send({ identifier, password });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  return agent;
}

async function removeCategory(agent, categoryId, expectedStatus) {
  const token = await csrfToken(agent);
  return agent
    .delete(`/api/categories/${categoryId}`)
    .set("x-csrf-token", token)
    .expect(expectedStatus);
}

test("eliminación de categorías mediante API", { skip: !hasTestDatabaseUrl }, async (t) => {
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

    const password = "api-category-deletion-password";
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
      ["category_deletion_owner", "category-deletion-owner@example.test", passwordHash, owner.id]
    );

    const manager = await client.query(
      "INSERT INTO users(username, email, password_hash, platform_role) VALUES($1, $2, $3, 'user') RETURNING id",
      ["category_deletion_manager", "category-deletion-manager@example.test", passwordHash]
    );
    const viewer = await client.query(
      "INSERT INTO users(username, email, password_hash, platform_role) VALUES($1, $2, $3, 'user') RETURNING id",
      ["category_deletion_viewer", "category-deletion-viewer@example.test", passwordHash]
    );
    const foreignUser = await client.query(
      "INSERT INTO users(username, email, password_hash, platform_role) VALUES($1, $2, $3, 'user') RETURNING id",
      ["category_deletion_foreign", "category-deletion-foreign@example.test", passwordHash]
    );
    await client.query(
      `INSERT INTO business_members(business_id, user_id, role, status)
       VALUES($1, $2, 'manager', 'active'), ($1, $3, 'viewer', 'active')`,
      [owner.business_id, manager.rows[0].id, viewer.rows[0].id]
    );
    const foreignBusiness = (await client.query(
      "INSERT INTO businesses(name, slug, created_by, status) VALUES($1, $2, $3, 'active') RETURNING id",
      ["Negocio ajeno eliminación", "negocio-ajeno-eliminacion", foreignUser.rows[0].id]
    )).rows[0];
    await client.query(
      "INSERT INTO business_members(business_id, user_id, role, status) VALUES($1, $2, 'owner', 'active')",
      [foreignBusiness.id, foreignUser.rows[0].id]
    );

    const emptyCategory = (await client.query(
      "INSERT INTO categories(name, description, business_id) VALUES($1, $2, $3) RETURNING id",
      ["Categoría vacía API", "Lista para eliminar", owner.business_id]
    )).rows[0];
    const activeCategory = (await client.query(
      "INSERT INTO categories(name, description, business_id) VALUES($1, $2, $3) RETURNING id",
      ["Categoría con activo", "No se puede eliminar", owner.business_id]
    )).rows[0];
    const archivedCategory = (await client.query(
      "INSERT INTO categories(name, description, business_id) VALUES($1, $2, $3) RETURNING id",
      ["Categoría con archivado", "No se puede eliminar", owner.business_id]
    )).rows[0];
    const foreignCategory = (await client.query(
      "INSERT INTO categories(name, description, business_id) VALUES($1, $2, $3) RETURNING id",
      ["Categoría ajena eliminación", "No debe revelarse", foreignBusiness.id]
    )).rows[0];
    await client.query(
      `INSERT INTO items(sku, name, description, brand, price, stock, category_id, business_id, status)
       VALUES($1, $2, $3, $4, $5, $6, $7, $8, 'active')`,
      ["CAT-ACT-001", "Producto activo", "Producto asociado activo", "Marca", 10, 0, activeCategory.id, owner.business_id]
    );
    await client.query(
      `INSERT INTO items(
        sku, name, description, brand, price, stock, category_id, business_id,
        status, archived_at, archived_by, archive_reason
      ) VALUES($1, $2, $3, $4, $5, $6, $7, $8, 'archived', clock_timestamp(), $9, $10)`,
      ["CAT-ARC-001", "Producto archivado", "Producto asociado archivado", "Marca", 10, 0, archivedCategory.id, owner.business_id, owner.id, "Producto descontinuado"]
    );

    const { default: app } = await import("../app.js");
    const { default: importedPool } = await import("../db/pool.js");
    pool = importedPool;
    const ownerAgent = await login(app, "category_deletion_owner", password);
    const managerAgent = await login(app, "category_deletion_manager", password);
    const viewerAgent = await login(app, "category_deletion_viewer", password);

    await t.test("owner elimina una categoría vacía y recibe 204", async () => {
      await removeCategory(ownerAgent, emptyCategory.id, 204);
      const stored = await client.query("SELECT COUNT(*)::INTEGER AS count FROM categories WHERE id = $1 AND business_id = $2", [emptyCategory.id, owner.business_id]);
      assert.equal(stored.rows[0].count, 0);
    });

    await t.test("categorías con productos activos o archivados responden 409 sin cambios", async () => {
      const beforeItems = Number((await client.query("SELECT COUNT(*) FROM items WHERE business_id = $1", [owner.business_id])).rows[0].count);
      for (const categoryId of [activeCategory.id, archivedCategory.id]) {
        const response = await removeCategory(ownerAgent, categoryId, 409);
        assert.equal(response.body.error.code, "CATEGORY_IN_USE");
      }
      const categories = await client.query("SELECT COUNT(*)::INTEGER AS count FROM categories WHERE id = ANY($1::bigint[])", [[activeCategory.id, archivedCategory.id]]);
      assert.equal(categories.rows[0].count, 2);
      const afterItems = Number((await client.query("SELECT COUNT(*) FROM items WHERE business_id = $1", [owner.business_id])).rows[0].count);
      assert.equal(afterItems, beforeItems);
    });

    await t.test("manager y viewer reciben 403; categoría ajena responde 404 sin cambios", async () => {
      for (const agent of [managerAgent, viewerAgent]) {
        const response = await removeCategory(agent, activeCategory.id, 403);
        assert.equal(response.body.error.code, "FORBIDDEN");
      }
      const foreign = await removeCategory(ownerAgent, foreignCategory.id, 404);
      assert.equal(foreign.body.error.code, "CATEGORY_NOT_FOUND");
      const stored = await client.query("SELECT business_id FROM categories WHERE id = $1", [foreignCategory.id]);
      assert.equal(stored.rows[0].business_id, foreignBusiness.id);
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
