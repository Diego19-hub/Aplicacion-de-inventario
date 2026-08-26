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

async function login(app, identifier, password) {
  const agent = request.agent(app);
  const token = (await agent.get("/api/csrf-token").expect(200)).body.data.csrfToken;
  await agent.post("/api/auth/login").set("x-csrf-token", token).send({ identifier, password }).expect(200);
  return agent;
}

async function csrfToken(agent) {
  return (await agent.get("/api/csrf-token").expect(200)).body.data.csrfToken;
}

function restoreEnvironment() {
  for (const [name, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

test("API de costos del negocio y costo de productos", { skip: !hasTestDatabaseUrl }, async (t) => {
  let client;
  let pool;
  let databaseCreated = false;

  try {
    process.env.NODE_ENV = "test";
    process.env.SESSION_SECRET = "business-cost-test-secret";
    await createTestDatabase();
    databaseCreated = true;
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    client = new Client({ connectionString: process.env.TEST_DATABASE_URL });
    await client.connect();

    const password = "business-cost-password";
    const passwordHash = await bcrypt.hash(password, 10);
    const owner = (await client.query(
      `SELECT u.id, b.id AS business_id
       FROM users u
       INNER JOIN business_members bm ON bm.user_id = u.id
       INNER JOIN businesses b ON b.id = bm.business_id
       WHERE bm.role = 'owner' AND bm.status = 'active' AND b.status = 'active'
       LIMIT 1`
    )).rows[0];
    assert.ok(owner);
    await client.query("UPDATE users SET username = $1, email = $2, password_hash = $3 WHERE id = $4", ["cost_owner", "cost-owner@example.test", passwordHash, owner.id]);

    const category = (await client.query(
      "INSERT INTO categories(name, description, business_id) VALUES($1, $2, $3) RETURNING id",
      ["Costos", "Categoría para pruebas de costos", owner.business_id]
    )).rows[0];
    const manager = (await client.query(
      "INSERT INTO users(username, email, password_hash, platform_role) VALUES($1, $2, $3, 'user') RETURNING id",
      ["cost_manager", "cost-manager@example.test", passwordHash]
    )).rows[0];
    const viewer = (await client.query(
      "INSERT INTO users(username, email, password_hash, platform_role) VALUES($1, $2, $3, 'user') RETURNING id",
      ["cost_viewer", "cost-viewer@example.test", passwordHash]
    )).rows[0];
    await client.query(
      "INSERT INTO business_members(business_id, user_id, role, status) VALUES($1, $2, 'manager', 'active'), ($1, $3, 'viewer', 'active')",
      [owner.business_id, manager.id, viewer.id]
    );
    const foreignUser = (await client.query(
      "INSERT INTO users(username, email, password_hash, platform_role) VALUES($1, $2, $3, 'user') RETURNING id",
      ["cost_foreign", "cost-foreign@example.test", passwordHash]
    )).rows[0];
    await client.query("BEGIN");
    let foreignBusiness;
    try {
    foreignBusiness = (await client.query(
      "INSERT INTO businesses(name, slug, created_by, status) VALUES($1, $2, $3, 'active') RETURNING id",
      ["Negocio costos ajeno", "negocio-costos-ajeno", foreignUser.id]
    )).rows[0];
    await client.query("INSERT INTO business_members(business_id, user_id, role, status) VALUES($1, $2, 'owner', 'active')", [foreignBusiness.id, foreignUser.id]);
    await client.query("INSERT INTO categories(business_id,name,description,is_default) VALUES($1,'General','Categoría predeterminada',true)", [foreignBusiness.id]);
    await client.query(
      "INSERT INTO business_costs(business_id, name, amount, created_by) VALUES($1, $2, $3, $4)",
      [foreignBusiness.id, "Costo ajeno", 20, foreignUser.id]
    );
    await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; }

    const { default: app } = await import("../app.js");
    const { default: importedPool } = await import("../db/pool.js");
    pool = importedPool;
    const ownerAgent = await login(app, "cost_owner", password);
    const managerAgent = await login(app, "cost_manager", password);
    const viewerAgent = await login(app, "cost_viewer", password);

    await t.test("owner y manager crean costos, viewer solo consulta", async () => {
      let token = await csrfToken(ownerAgent);
      const ownerResponse = await ownerAgent.post("/api/business-costs").set("x-csrf-token", token).send({ name: "Renta", amount: 10000, costType: "fixed", frequency: "monthly" }).expect(201);
      assert.equal(ownerResponse.body.data.cost.amount, 10000);
      assert.equal(ownerResponse.body.data.cost.isActive, true);

      token = await csrfToken(managerAgent);
      const managerResponse = await managerAgent.post("/api/business-costs").set("x-csrf-token", token).send({ name: "Comisión", description: "Variable", amount: 125, costType: "variable", frequency: "one_time" }).expect(201);
      assert.equal(managerResponse.body.data.cost.costType, "variable");

      token = await csrfToken(viewerAgent);
      await viewerAgent.post("/api/business-costs").set("x-csrf-token", token).send({ name: "No", amount: 1, costType: "fixed", frequency: "monthly" }).expect(403);
      const list = await viewerAgent.get("/api/business-costs").expect(200);
      assert.equal(list.body.data.costs.length, 2);
      assert.equal(list.body.data.costs.some((cost) => cost.name === "Costo ajeno"), false);
    });

    await t.test("valida importes, actualiza y desactiva sin borrar", async () => {
      let token = await csrfToken(ownerAgent);
      const negative = await ownerAgent.post("/api/business-costs").set("x-csrf-token", token).send({ name: "Inválido", amount: -1, costType: "fixed", frequency: "monthly" }).expect(400);
      assert.equal(negative.body.error.code, "VALIDATION_ERROR");

      const cost = (await client.query("SELECT id FROM business_costs WHERE business_id = $1 AND name = $2", [owner.business_id, "Renta"])).rows[0];
      token = await csrfToken(ownerAgent);
      const updated = await ownerAgent.put(`/api/business-costs/${cost.id}`).set("x-csrf-token", token).send({ name: "Renta actualizada", amount: 11000, costType: "fixed", frequency: "monthly" }).expect(200);
      assert.equal(updated.body.data.cost.name, "Renta actualizada");

      token = await csrfToken(ownerAgent);
      await ownerAgent.patch(`/api/business-costs/${cost.id}/status`).set("x-csrf-token", token).send({ isActive: false }).expect(200);
      const stored = (await client.query("SELECT name, is_active FROM business_costs WHERE id = $1", [cost.id])).rows[0];
      assert.deepEqual(stored, { name: "Renta actualizada", is_active: false });
    });

    await t.test("guarda cost_price y permite productos antiguos sin costo", async () => {
      let token = await csrfToken(ownerAgent);
      const response = await ownerAgent.post("/api/products").set("x-csrf-token", token).send({
        name: "Producto con costo",
        description: "Descripción para producto con costo.",
        brand: "Marca",
        price: 25,
        costPrice: 12.5,
        categoryId: category.id,
        sku: "COST-001"
      }).expect(201);
      assert.equal(response.body.data.product.costPrice, 12.5);
      const stored = (await client.query("SELECT cost_price FROM items WHERE id = $1", [response.body.data.product.id])).rows[0];
      assert.equal(stored.cost_price, "12.50");

      const oldProduct = (await client.query(
        `INSERT INTO items(sku, name, description, brand, price, stock, category_id, business_id, status)
         VALUES($1, $2, $3, $4, $5, 0, $6, $7, 'active') RETURNING id`,
        ["COST-OLD", "Producto sin costo", "Producto antiguo sin costo", "Marca", 20, category.id, owner.business_id]
      )).rows[0];
      const detail = await ownerAgent.get(`/api/products/${oldProduct.id}`).expect(200);
      assert.equal(detail.body.data.product.costPrice, null);
      token = await csrfToken(ownerAgent);
      await ownerAgent.put(`/api/products/${oldProduct.id}`).set("x-csrf-token", token).send({ name: "Producto sin costo", description: "", brand: "Marca", price: 20, categoryId: category.id, sku: "COST-OLD", costPrice: -1 }).expect(400);
    });
  } finally {
    if (client) await client.end();
    if (pool) await pool.end();
    if (databaseCreated) await dropTestDatabase();
    restoreEnvironment();
  }
});
