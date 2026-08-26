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
  await agent
    .post("/api/auth/login")
    .set("x-csrf-token", token)
    .send({ identifier, password })
    .expect(200);
  return agent;
}

test("consulta de categorías mediante API", { skip: !hasTestDatabaseUrl }, async (t) => {
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

    const password = "api-categories-password";
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
      ["categories_owner", "categories-owner@example.test", passwordHash, owner.id]
    );
    const manager = (await client.query(
      "INSERT INTO users(username, email, password_hash, platform_role) VALUES($1, $2, $3, 'user') RETURNING id",
      ["categories_manager", "categories-manager@example.test", passwordHash]
    )).rows[0];
    const viewer = (await client.query(
      "INSERT INTO users(username, email, password_hash, platform_role) VALUES($1, $2, $3, 'user') RETURNING id",
      ["categories_viewer", "categories-viewer@example.test", passwordHash]
    )).rows[0];
    await client.query(
      `INSERT INTO business_members(business_id, user_id, role, status)
       VALUES($1, $2, 'manager', 'active'), ($1, $3, 'viewer', 'active')`,
      [owner.business_id, manager.id, viewer.id]
    );

    const category = (await client.query(
      "INSERT INTO categories(name, description, business_id) VALUES($1, $2, $3) RETURNING id",
      ["Categoría principal API", "Categoría con métricas separadas", owner.business_id]
    )).rows[0];
    await client.query(
      `INSERT INTO items(sku, name, description, brand, price, stock, category_id, business_id, status)
       VALUES($1, $2, $3, $4, $5, $6, $7, $8, 'active'),
             ($9, $10, $11, $12, $13, $14, $7, $8, 'active')`,
      ["CAT-ACT-001", "Producto activo uno", "Descripción", "Marca A", 12.5, 5, category.id, owner.business_id, "CAT-ACT-002", "Producto activo dos", "Descripción", "Marca B", 7.5, 3]
    );
    await client.query(
      `INSERT INTO items(sku, name, description, brand, price, stock, category_id, business_id, status, archived_at, archived_by, archive_reason)
       VALUES($1, $2, $3, $4, $5, $6, $7, $8, 'archived', clock_timestamp(), $9, $10)`,
      ["CAT-ARC-001", "Producto archivado", "Descripción", "Marca C", 4, 11, category.id, owner.business_id, owner.id, "Producto archivado para categoría"]
    );
    for (let index = 1; index <= 20; index += 1) {
      await client.query(
        "INSERT INTO categories(name, description, business_id) VALUES($1, $2, $3)",
        [`Categoría página ${String(index).padStart(2, "0")}`, "Categoría para paginación", owner.business_id]
      );
    }

    const foreignUser = (await client.query(
      "INSERT INTO users(username, email, password_hash, platform_role) VALUES($1, $2, $3, 'user') RETURNING id",
      ["categories_foreign", "categories-foreign@example.test", passwordHash]
    )).rows[0];
    await client.query("BEGIN");
    let foreignBusiness;
    try {
      foreignBusiness = (await client.query(
        "INSERT INTO businesses(name, slug, created_by, status) VALUES($1, $2, $3, 'active') RETURNING id",
        ["Negocio ajeno categorías", "negocio-ajeno-categorias", foreignUser.id]
      )).rows[0];
      await client.query(
        "INSERT INTO business_members(business_id, user_id, role, status) VALUES($1, $2, 'owner', 'active')",
        [foreignBusiness.id, foreignUser.id]
      );
      await client.query(
        "INSERT INTO categories(name, description, business_id, is_default) VALUES('General', 'Categoría predeterminada', $1, true)",
        [foreignBusiness.id]
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
    const foreignCategory = (await client.query(
      "INSERT INTO categories(name, description, business_id) VALUES($1, $2, $3) RETURNING id",
      ["Categoría exclusiva ajena", "No debe ser visible", foreignBusiness.id]
    )).rows[0];
    await client.query(
      `INSERT INTO items(sku, name, description, brand, price, stock, category_id, business_id, status)
       VALUES($1, $2, $3, $4, $5, $6, $7, $8, 'active')`,
      ["CAT-FOR-001", "Producto ajeno", "Descripción", "Marca", 99, 99, foreignCategory.id, foreignBusiness.id]
    );

    const { default: app } = await import("../app.js");
    const { default: importedPool } = await import("../db/pool.js");
    pool = importedPool;
    const ownerAgent = await login(app, "categories_owner", password);
    const managerAgent = await login(app, "categories_manager", password);
    const viewerAgent = await login(app, "categories_viewer", password);

    await t.test("los tres roles ven únicamente categorías y métricas del negocio activo", async () => {
      for (const agent of [ownerAgent, managerAgent, viewerAgent]) {
        const response = await agent.get("/api/categories").expect(200).expect("Cache-Control", "no-store");
        assert.equal(response.body.data.pagination.totalItems, 22);
        assert.equal(response.body.data.categories.some((item) => item.name === "Categoría exclusiva ajena"), false);
        const targetResponse = await agent.get("/api/categories?q=principal").expect(200);
        assert.deepEqual(targetResponse.body.data.categories[0], {
          id: category.id,
          name: "Categoría principal API",
          description: "Categoría con métricas separadas",
          activeProductCount: 2,
          archivedProductCount: 1,
          totalStock: 8,
          isDefault: false
        });
      }
    });

    await t.test("búsqueda y paginación mantienen conteo y resultados", async () => {
      const search = await ownerAgent.get("/api/categories?q=principal").expect(200);
      assert.equal(search.body.data.pagination.totalItems, 1);
      assert.equal(search.body.data.categories[0].id, category.id);
      const pageTwo = await ownerAgent.get("/api/categories?page=2").expect(200);
      assert.equal(pageTwo.body.data.pagination.page, 2);
      assert.equal(pageTwo.body.data.pagination.totalItems, 22);
      assert.equal(pageTwo.body.data.categories.length, 2);
    });

    await t.test("el detalle excluye archivados y protege categoría ajena o ID inválido", async () => {
      const detail = await viewerAgent.get(`/api/categories/${category.id}`).expect(200);
      assert.deepEqual(detail.body.data.category, {
        id: category.id,
        name: "Categoría principal API",
        description: "Categoría con métricas separadas",
        activeProductCount: 2,
        archivedProductCount: 1,
        totalStock: 8,
        isDefault: false
      });
      assert.equal(detail.body.data.products.length, 2);
      assert.equal(detail.body.data.products.some((product) => product.sku === "CAT-ARC-001"), false);
      assert.ok(detail.body.data.products.every((product) => typeof product.price === "number" && typeof product.stock === "number"));

      const foreign = await viewerAgent.get(`/api/categories/${foreignCategory.id}`).expect(404);
      assert.equal(foreign.body.error.code, "CATEGORY_NOT_FOUND");
      const invalid = await viewerAgent.get("/api/categories/1.5").expect(400);
      assert.equal(invalid.body.error.code, "VALIDATION_ERROR");
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
