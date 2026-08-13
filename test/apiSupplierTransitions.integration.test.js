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
  await agent.post("/api/auth/login").set("x-csrf-token", token).send({ identifier, password }).expect(200);
  return agent;
}

async function transition(agent, path, expectedStatus) {
  const token = await csrfToken(agent);
  return agent.post(path).set("x-csrf-token", token).send({}).expect(expectedStatus);
}

test("transiciones de proveedores mediante API", { skip: !hasTestDatabaseUrl }, async (t) => {
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

    const password = "api-supplier-transition-password";
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
      ["supplier_transition_owner", "supplier-transition-owner@example.test", passwordHash, owner.id]
    );
    const manager = await client.query(
      "INSERT INTO users(username, email, password_hash, platform_role) VALUES($1, $2, $3, 'user') RETURNING id",
      ["supplier_transition_manager", "supplier-transition-manager@example.test", passwordHash]
    );
    const viewer = await client.query(
      "INSERT INTO users(username, email, password_hash, platform_role) VALUES($1, $2, $3, 'user') RETURNING id",
      ["supplier_transition_viewer", "supplier-transition-viewer@example.test", passwordHash]
    );
    const foreignUser = await client.query(
      "INSERT INTO users(username, email, password_hash, platform_role) VALUES($1, $2, $3, 'user') RETURNING id",
      ["supplier_transition_foreign", "supplier-transition-foreign@example.test", passwordHash]
    );
    await client.query(
      `INSERT INTO business_members(business_id, user_id, role, status)
       VALUES($1, $2, 'manager', 'active'), ($1, $3, 'viewer', 'active')`,
      [owner.business_id, manager.rows[0].id, viewer.rows[0].id]
    );
    const supplier = (await client.query(
      `
        INSERT INTO suppliers(business_id, name, legal_name, tax_id, email, phone, address, notes)
        VALUES($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id, updated_at
      `,
      [owner.business_id, "Proveedor para transición", "Proveedor SA", "PST010101AA1", "proveedor@test.example", "5550000000", "Avenida 1", "Información conservada"]
    )).rows[0];
    const foreignBusiness = (await client.query(
      "INSERT INTO businesses(name, slug, created_by, status) VALUES($1, $2, $3, 'active') RETURNING id",
      ["Negocio ajeno transición", "negocio-ajeno-supplier-transition", foreignUser.rows[0].id]
    )).rows[0];
    await client.query(
      "INSERT INTO business_members(business_id, user_id, role, status) VALUES($1, $2, 'owner', 'active')",
      [foreignBusiness.id, foreignUser.rows[0].id]
    );
    const foreignSupplier = (await client.query(
      "INSERT INTO suppliers(business_id, name) VALUES($1, $2) RETURNING id",
      [foreignBusiness.id, "Proveedor ajeno transición"]
    )).rows[0];

    const { default: app } = await import("../app.js");
    const { default: importedPool } = await import("../db/pool.js");
    pool = importedPool;
    const ownerAgent = await login(app, "supplier_transition_owner", password);
    const managerAgent = await login(app, "supplier_transition_manager", password);
    const viewerAgent = await login(app, "supplier_transition_viewer", password);

    await t.test("manager desactiva y conserva los datos; updated_at cambia", async () => {
      await client.query("SELECT pg_sleep(0.05)");
      const response = await transition(managerAgent, `/api/suppliers/${supplier.id}/deactivate`, 200);
      const updated = response.body.data.supplier;
      assert.equal(updated.status, "inactive");
      assert.equal(updated.name, "Proveedor para transición");
      assert.equal(updated.legalName, "Proveedor SA");
      assert.equal(updated.taxId, "PST010101AA1");
      assert.equal(updated.notes, "Información conservada");
      assert.ok(new Date(updated.updatedAt) > new Date(supplier.updated_at));
    });

    await t.test("reactivación funciona y los segundos intentos no modifican nada", async () => {
      const repeatedDeactivation = await transition(ownerAgent, `/api/suppliers/${supplier.id}/deactivate`, 409);
      assert.equal(repeatedDeactivation.body.error.code, "SUPPLIER_ALREADY_INACTIVE");
      const reactivated = await transition(ownerAgent, `/api/suppliers/${supplier.id}/reactivate`, 200);
      assert.equal(reactivated.body.data.supplier.status, "active");
      const updatedAt = reactivated.body.data.supplier.updatedAt;
      const repeatedReactivation = await transition(managerAgent, `/api/suppliers/${supplier.id}/reactivate`, 409);
      assert.equal(repeatedReactivation.body.error.code, "SUPPLIER_ALREADY_ACTIVE");
      const stored = await client.query("SELECT status, updated_at FROM suppliers WHERE id = $1 AND business_id = $2", [supplier.id, owner.business_id]);
      assert.equal(stored.rows[0].status, "active");
      assert.equal(new Date(stored.rows[0].updated_at).toISOString(), new Date(updatedAt).toISOString());
    });

    await t.test("viewer recibe 403 y el proveedor ajeno responde 404 sin cambios", async () => {
      const viewerResponse = await transition(viewerAgent, `/api/suppliers/${supplier.id}/deactivate`, 403);
      assert.equal(viewerResponse.body.error.code, "FORBIDDEN");
      const foreignResponse = await transition(ownerAgent, `/api/suppliers/${foreignSupplier.id}/deactivate`, 404);
      assert.equal(foreignResponse.body.error.code, "SUPPLIER_NOT_FOUND");
      const foreignStored = await client.query("SELECT business_id, status FROM suppliers WHERE id = $1", [foreignSupplier.id]);
      assert.deepEqual(foreignStored.rows[0], { business_id: foreignBusiness.id, status: "active" });
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
