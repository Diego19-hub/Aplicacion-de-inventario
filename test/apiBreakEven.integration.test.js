import test from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcrypt";
import pg from "pg";
import request from "supertest";

import { createTestDatabase, dropTestDatabase } from "./helpers/testDatabase.js";

const { Client } = pg;
const hasTestDatabaseUrl = Boolean(process.env.TEST_DATABASE_URL);
const originalEnvironment = { NODE_ENV: process.env.NODE_ENV, SESSION_SECRET: process.env.SESSION_SECRET, DATABASE_URL: process.env.DATABASE_URL };

async function login(app, identifier, password) {
  const agent = request.agent(app);
  const csrf = (await agent.get("/api/csrf-token").expect(200)).body.data.csrfToken;
  await agent.post("/api/auth/login").set("x-csrf-token", csrf).send({ identifier, password }).expect(200);
  return agent;
}

function restoreEnvironment() {
  for (const [name, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

test("GET /api/break-even", { skip: !hasTestDatabaseUrl }, async (t) => {
  let client;
  let pool;
  let databaseCreated = false;

  try {
    process.env.NODE_ENV = "test";
    process.env.SESSION_SECRET = "break-even-test-secret";
    await createTestDatabase();
    databaseCreated = true;
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    client = new Client({ connectionString: process.env.TEST_DATABASE_URL });
    await client.connect();

    const password = "break-even-password";
    const passwordHash = await bcrypt.hash(password, 10);
    const owner = (await client.query(
      `SELECT u.id, b.id AS business_id
       FROM users u JOIN business_members bm ON bm.user_id = u.id
       JOIN businesses b ON b.id = bm.business_id
       WHERE bm.role = 'owner' AND bm.status = 'active' AND b.status = 'active'
       LIMIT 1`
    )).rows[0];
    assert.ok(owner);
    await client.query("UPDATE users SET username = $1, email = $2, password_hash = $3 WHERE id = $4", ["break_even_owner", "break-even-owner@example.test", passwordHash, owner.id]);

    const location = (await client.query("SELECT id FROM business_locations WHERE business_id = $1 AND status = 'active' LIMIT 1", [owner.business_id])).rows[0];
    const category = (await client.query("INSERT INTO categories(name, description, business_id) VALUES($1, $2, $3) RETURNING id", ["Punto equilibrio", "Categoría de prueba", owner.business_id])).rows[0];
    const item = (await client.query(
      `INSERT INTO items(sku, name, description, brand, price, cost_price, stock, category_id, business_id, status)
       VALUES($1, $2, $3, $4, $5, $6, 0, $7, $8, 'active') RETURNING id`,
      ["BE-001", "Producto equilibrio", "Producto para prueba de equilibrio", "Marca", 250, 140, category.id, owner.business_id]
    )).rows[0];
    await client.query(
      `INSERT INTO business_costs(business_id, name, amount, cost_type, frequency, created_by, created_at)
       VALUES($1, 'Renta mensual', 10000, 'fixed', 'monthly', $2, '2026-08-01T00:00:00Z'),
             ($1, 'Seguro anual', 1200, 'fixed', 'yearly', $2, '2026-08-01T00:00:00Z'),
             ($1, 'Costo único', 500, 'fixed', 'one_time', $2, '2026-08-01T00:00:00Z')`,
      [owner.business_id, owner.id]
    );
    const sale = (await client.query(
      `INSERT INTO sales(business_id, location_id, created_by, payment_method, subtotal, total, amount_received, change_amount, status, created_at)
       VALUES($1, $2, $3, 'card', 25000, 25000, 25000, 0, 'completed', '2026-08-10T12:00:00Z') RETURNING id`,
      [owner.business_id, location.id, owner.id]
    )).rows[0];
    await client.query(
      `INSERT INTO sale_items(business_id, sale_id, item_id, quantity, unit_price, unit_cost, line_total)
       VALUES($1, $2, $3, 100, 250, 140, 25000)`,
      [owner.business_id, sale.id, item.id]
    );
    await client.query(
      `INSERT INTO sales(business_id, location_id, created_by, payment_method, subtotal, total, status, created_at)
       VALUES($1, $2, $3, 'card', 99, 99, 'cancelled', '2026-08-11T12:00:00Z')`,
      [owner.business_id, location.id, owner.id]
    );

    const { default: app } = await import("../app.js");
    const { default: importedPool } = await import("../db/pool.js");
    pool = importedPool;

    await t.test("requiere autenticación y mes válido", async () => {
      await request(app).get("/api/break-even?month=2026-08").expect(401);
      const agent = await login(app, "break_even_owner", password);
      const invalid = await agent.get("/api/break-even?month=2026-8").expect(400);
      assert.equal(invalid.body.error.code, "VALIDATION_ERROR");
    });

    const agent = await login(app, "break_even_owner", password);
    await t.test("incluye completed, divide anuales y excluye cancelled", async () => {
      const response = await agent.get("/api/break-even?month=2026-08").expect(200);
      const result = response.body.data;
      assert.equal(result.revenue, 25000);
      assert.equal(result.unitsSold, 100);
      assert.equal(result.variableCosts, 14000);
      assert.equal(result.fixedCosts, 11000);
      assert.equal(result.breakEvenUnits, 100);
      assert.equal(result.breakEvenRevenue, 25000);
    });

    await t.test("un mes sin ventas no divide entre cero", async () => {
      const result = (await agent.get("/api/break-even?month=2026-09").expect(200)).body.data;
      assert.equal(result.salesCount, 0);
      assert.equal(result.breakEvenUnits, null);
      assert.equal(result.breakEvenRevenue, null);
    });
  } finally {
    if (client) await client.end();
    if (pool) await pool.end();
    if (databaseCreated) await dropTestDatabase();
    restoreEnvironment();
  }
});
