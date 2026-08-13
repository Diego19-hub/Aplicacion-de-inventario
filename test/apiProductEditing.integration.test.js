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

async function login(app, identifier, password) {
  const agent = request.agent(app);
  const token = (await agent.get("/api/csrf-token").expect(200)).body.data.csrfToken;
  await agent.post("/api/auth/login").set("x-csrf-token", token).send({ identifier, password }).expect(200);
  return agent;
}

async function csrfToken(agent) {
  return (await agent.get("/api/csrf-token").expect(200)).body.data.csrfToken;
}

test("edición de productos mediante API", { skip: !hasTestDatabaseUrl }, async (t) => {
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

    const password = "api-product-edit-password";
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
      ["editing_owner", "editing-owner@example.test", passwordHash, owner.id]
    );

    const categories = (await client.query(
      `INSERT INTO categories(name, description, business_id)
       VALUES ($1, $2, $3), ($4, $5, $3)
       RETURNING id, name`,
      ["Categoría original", "Categoría inicial", owner.business_id, "Categoría destino", "Categoría destino"]
    )).rows;
    const [originalCategory, destinationCategory] = categories;
    const product = (await client.query(
      `INSERT INTO items(sku, name, description, brand, price, stock, category_id, business_id, status)
       VALUES($1, $2, $3, $4, $5, $6, $7, $8, 'active')
       RETURNING id`,
      ["EDIT-001", "Producto original", "Descripción original", "Marca original", 19, 7, originalCategory.id, owner.business_id]
    )).rows[0];
    await client.query(
      `INSERT INTO items(sku, name, description, brand, price, stock, category_id, business_id, status)
       VALUES($1, $2, $3, $4, $5, $6, $7, $8, 'active')`,
      ["DUP-001", "Producto duplicado", "Descripción duplicada", "Marca duplicada", 20, 0, originalCategory.id, owner.business_id]
    );
    const archivedProduct = (await client.query(
      `INSERT INTO items(sku, name, description, brand, price, stock, category_id, business_id, status, archived_at, archived_by, archive_reason)
       VALUES($1, $2, $3, $4, $5, $6, $7, $8, 'archived', clock_timestamp(), $9, $10)
       RETURNING id`,
      ["EDIT-ARCH", "Producto archivado", "Descripción archivada", "Marca", 1, 0, originalCategory.id, owner.business_id, owner.id, "Prueba de archivado"]
    )).rows[0];
    const viewer = (await client.query(
      "INSERT INTO users(username, email, password_hash, platform_role) VALUES($1, $2, $3, 'user') RETURNING id",
      ["editing_viewer", "editing-viewer@example.test", passwordHash]
    )).rows[0];
    await client.query(
      "INSERT INTO business_members(business_id, user_id, role, status) VALUES($1, $2, 'viewer', 'active')",
      [owner.business_id, viewer.id]
    );
    const foreignUser = (await client.query(
      "INSERT INTO users(username, email, password_hash, platform_role) VALUES($1, $2, $3, 'user') RETURNING id",
      ["editing_foreign", "editing-foreign@example.test", passwordHash]
    )).rows[0];
    const foreignBusiness = (await client.query(
      "INSERT INTO businesses(name, slug, created_by, status) VALUES($1, $2, $3, 'active') RETURNING id",
      ["Negocio ajeno edición", "negocio-ajeno-edicion", foreignUser.id]
    )).rows[0];
    await client.query("INSERT INTO business_members(business_id, user_id, role, status) VALUES($1, $2, 'owner', 'active')", [foreignBusiness.id, foreignUser.id]);
    const foreignCategory = (await client.query("INSERT INTO categories(name, description, business_id) VALUES($1, $2, $3) RETURNING id", ["Categoría ajena edición", "Categoría", foreignBusiness.id])).rows[0];
    const foreignProduct = (await client.query(
      `INSERT INTO items(sku, name, description, brand, price, stock, category_id, business_id, status)
       VALUES($1, $2, $3, $4, $5, $6, $7, $8, 'active') RETURNING id`,
      ["FOREIGN-EDIT", "Producto ajeno", "Descripción ajena", "Marca", 2, 4, foreignCategory.id, foreignBusiness.id]
    )).rows[0];

    const { default: app } = await import("../app.js");
    const { default: importedPool } = await import("../db/pool.js");
    pool = importedPool;
    const ownerAgent = await login(app, "editing_owner", password);

    await t.test("owner actualiza nombre, categoría y SKU sin cambiar existencias", async () => {
      const editData = await ownerAgent.get(`/api/products/${product.id}/edit`).expect(200).expect("Cache-Control", "no-store");
      assert.equal(editData.body.data.product.sku, "EDIT-001");
      assert.deepEqual(editData.body.data.categories.map((category) => category.id), [destinationCategory.id, originalCategory.id]);

      const token = await csrfToken(ownerAgent);
      const response = await ownerAgent
        .put(`/api/products/${product.id}`)
        .set("x-csrf-token", token)
        .send({ name: "Producto actualizado", description: "", brand: "Marca actualizada", price: 34.5, categoryId: destinationCategory.id, sku: " edit-002 " })
        .expect(200);

      assert.deepEqual(response.body.data.product.category, destinationCategory);
      assert.equal(response.body.data.product.sku, "EDIT-002");
      assert.equal(response.body.data.product.stock, 7);
      const stored = await client.query("SELECT name, sku, category_id, stock FROM items WHERE id = $1", [product.id]);
      assert.deepEqual(stored.rows[0], { name: "Producto actualizado", sku: "EDIT-002", category_id: destinationCategory.id, stock: 7 });
    });

    await t.test("viewer recibe 403 y productos ajeno o archivado no están disponibles", async () => {
      const viewerAgent = await login(app, "editing_viewer", password);
      const token = await csrfToken(viewerAgent);
      const viewerResponse = await viewerAgent
        .put(`/api/products/${product.id}`)
        .set("x-csrf-token", token)
        .send({ name: "No permitido", description: "", brand: "Marca", price: 1, categoryId: destinationCategory.id, sku: "VIEW-EDIT" })
        .expect(403);
      assert.equal(viewerResponse.body.error.code, "FORBIDDEN");

      for (const unavailableProduct of [foreignProduct, archivedProduct]) {
        const response = await ownerAgent.get(`/api/products/${unavailableProduct.id}/edit`).expect(404);
        assert.equal(response.body.error.code, "PRODUCT_NOT_FOUND");
      }
    });

    await t.test("SKU duplicado o campos protegidos fallan sin actualizaciones parciales", async () => {
      const before = (await client.query("SELECT name, sku, stock FROM items WHERE id = $1", [product.id])).rows[0];
      let token = await csrfToken(ownerAgent);
      const duplicate = await ownerAgent
        .put(`/api/products/${product.id}`)
        .set("x-csrf-token", token)
        .send({ name: "Nombre no guardado", description: "", brand: "Marca", price: 11, categoryId: destinationCategory.id, sku: "dup-001" })
        .expect(409);
      assert.equal(duplicate.body.error.code, "SKU_ALREADY_EXISTS");

      token = await csrfToken(ownerAgent);
      const protectedField = await ownerAgent
        .put(`/api/products/${product.id}`)
        .set("x-csrf-token", token)
        .send({ name: "Nombre no guardado", description: "", brand: "Marca", price: 11, categoryId: destinationCategory.id, sku: "EDIT-003", stock: 99 })
        .expect(400);
      assert.equal(protectedField.body.error.code, "VALIDATION_ERROR");
      assert.equal(protectedField.body.error.fields[0].field, "stock");

      const after = (await client.query("SELECT name, sku, stock FROM items WHERE id = $1", [product.id])).rows[0];
      assert.deepEqual(after, before);
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
