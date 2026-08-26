import test from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcrypt";
import pg from "pg";
import request from "supertest";

import { createTestDatabase, dropTestDatabase } from "./helpers/testDatabase.js";

const { Client } = pg;
const hasTestDatabaseUrl = Boolean(process.env.TEST_DATABASE_URL);
const originalEnvironment = { NODE_ENV: process.env.NODE_ENV, SESSION_SECRET: process.env.SESSION_SECRET, DATABASE_URL: process.env.DATABASE_URL };

function restoreEnvironment() {
  for (const [name, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

async function apiLogin(app, identifier, password) {
  const agent = request.agent(app);
  const csrfToken = (await agent.get("/api/csrf-token").expect(200)).body.data.csrfToken;
  await agent.post("/api/auth/login").set("x-csrf-token", csrfToken).send({ identifier, password }).expect(200);
  return agent;
}

test("GET /api/products", { skip: !hasTestDatabaseUrl }, async (t) => {
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

    const password = "api-products-password";
    const passwordHash = await bcrypt.hash(password, 10);
    const ownerResult = await client.query("SELECT u.id,b.id business_id FROM users u JOIN business_members bm ON bm.user_id=u.id JOIN businesses b ON b.id=bm.business_id WHERE u.platform_role='super_admin' AND bm.role='owner' AND bm.status='active' AND b.status='active' LIMIT 1");
    const owner = ownerResult.rows[0];
    await client.query("UPDATE users SET username=$1,email=$2,password_hash=$3 WHERE id=$4", ["products_owner", "products-owner@example.test", passwordHash, owner.id]);
    const category = await client.query("INSERT INTO categories(name,description,business_id) VALUES($1,$2,$3) RETURNING id", ["Categoría productos", "Categoría de prueba", owner.business_id]);
    const categoryId = category.rows[0].id;
    await client.query("INSERT INTO items(sku,name,description,brand,price,stock,category_id,business_id,status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'active'),($9,$10,$11,$12,$13,$14,$7,$8,'active')", ["ACT-001", "Alfa activo", "Descripción", "Marca A", 10, 3, categoryId, owner.business_id, "ACT-002", "Beta activo", "Descripción", "Marca B", 20, 6]);
    await client.query("INSERT INTO items(sku,name,description,brand,price,stock,category_id,business_id,status,archived_at,archived_by,archive_reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'archived',clock_timestamp(),$9,$10)", ["ARC-001", "Archivado oculto", "Descripción", "Marca C", 30, 9, categoryId, owner.business_id, owner.id, "Producto archivado para prueba"]);

    const foreignUser = await client.query("INSERT INTO users(username,email,password_hash,platform_role) VALUES($1,$2,$3,'user') RETURNING id", ["products_foreign", "products-foreign@example.test", passwordHash]);
    await client.query("BEGIN");
    let foreignBusinessId;
    try {
      const foreignBusiness = await client.query("INSERT INTO businesses(name,slug,created_by,status) VALUES($1,$2,$3,'active') RETURNING id", ["Negocio ajeno productos", "negocio-ajeno-productos", foreignUser.rows[0].id]);
      foreignBusinessId = foreignBusiness.rows[0].id;
      await client.query("INSERT INTO business_members(business_id,user_id,role,status) VALUES($1,$2,'owner','active')", [foreignBusinessId, foreignUser.rows[0].id]);
      await client.query("INSERT INTO categories(name,description,business_id,is_default) VALUES('General','Categoría predeterminada',$1,true)", [foreignBusinessId]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
    const foreignCategory = await client.query("INSERT INTO categories(name,description,business_id) VALUES($1,$2,$3) RETURNING id", ["Categoría ajena productos", "Categoría ajena", foreignBusinessId]);
    await client.query("INSERT INTO items(sku,name,description,brand,price,stock,category_id,business_id,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'active')", ["FOREIGN-001", "Producto ajeno", "Descripción", "Marca", 99, 1, foreignCategory.rows[0].id, foreignBusinessId]);

    const { default: app } = await import("../app.js");
    const { default: importedPool } = await import("../db/pool.js");
    pool = importedPool;
    const agent = await apiLogin(app, "products_owner", password);

    await t.test("negocio activo obtiene únicamente productos activos propios", async () => {
      const response = await agent.get("/api/products").expect(200).expect("Cache-Control", "no-store");
      assert.equal(response.body.data.pagination.totalItems, 2);
      assert.deepEqual(response.body.data.products.map((product) => product.sku), ["ACT-001", "ACT-002"]);
      assert.equal(JSON.stringify(response.body).includes("ARC-001"), false);
      assert.equal(JSON.stringify(response.body).includes("FOREIGN-001"), false);
    });

    await t.test("búsqueda y categoría combinadas mantienen conteo consistente", async () => {
      const response = await agent.get(`/api/products?q=alfa&category=${categoryId}`).expect(200);
      assert.equal(response.body.data.pagination.totalItems, 1);
      assert.equal(response.body.data.products.length, 1);
      assert.equal(response.body.data.products[0].name, "Alfa activo");
      assert.equal(response.body.data.filters.categoryId, categoryId);
    });

    await t.test("categoría ajena devuelve vacío y página inválida se normaliza", async () => {
      const response = await agent.get(`/api/products?category=${foreignCategory.rows[0].id}&page=1.5`).expect(200);
      assert.equal(response.body.data.pagination.totalItems, 0);
      assert.deepEqual(response.body.data.products, []);
      assert.equal(response.body.data.pagination.page, 1);
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
