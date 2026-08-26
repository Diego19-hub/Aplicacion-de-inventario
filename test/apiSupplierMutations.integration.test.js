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

async function mutate(agent, method, path, body, expectedStatus) {
  const token = await csrfToken(agent);
  return agent[method](path).set("x-csrf-token", token).send(body).expect(expectedStatus);
}

test("creación y edición de proveedores mediante API", { skip: !hasTestDatabaseUrl }, async (t) => {
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

    const password = "api-supplier-mutations-password";
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
      ["supplier_mutation_owner", "supplier-mutation-owner@example.test", passwordHash, owner.id]
    );

    const manager = await client.query(
      "INSERT INTO users(username, email, password_hash, platform_role) VALUES($1, $2, $3, 'user') RETURNING id",
      ["supplier_mutation_manager", "supplier-mutation-manager@example.test", passwordHash]
    );
    const viewer = await client.query(
      "INSERT INTO users(username, email, password_hash, platform_role) VALUES($1, $2, $3, 'user') RETURNING id",
      ["supplier_mutation_viewer", "supplier-mutation-viewer@example.test", passwordHash]
    );
    const foreignUser = await client.query(
      "INSERT INTO users(username, email, password_hash, platform_role) VALUES($1, $2, $3, 'user') RETURNING id",
      ["supplier_mutation_foreign", "supplier-mutation-foreign@example.test", passwordHash]
    );
    await client.query(
      `INSERT INTO business_members(business_id, user_id, role, status)
       VALUES($1, $2, 'manager', 'active'), ($1, $3, 'viewer', 'active')`,
      [owner.business_id, manager.rows[0].id, viewer.rows[0].id]
    );

    await client.query("BEGIN");
    let foreignBusiness;
    try {
      foreignBusiness = (await client.query(
        "INSERT INTO businesses(name, slug, created_by, status) VALUES($1, $2, $3, 'active') RETURNING id",
        ["Negocio ajeno de proveedores", "negocio-ajeno-proveedores-mut", foreignUser.rows[0].id]
      )).rows[0];
      await client.query("INSERT INTO business_members(business_id, user_id, role, status) VALUES($1, $2, 'owner', 'active')", [foreignBusiness.id, foreignUser.rows[0].id]);
      await client.query("INSERT INTO categories(business_id, name, description, is_default) VALUES($1, 'General', 'Categoría predeterminada', true)", [foreignBusiness.id]);
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    const foreignSupplier = (await client.query(
      "INSERT INTO suppliers(business_id, name) VALUES($1, $2) RETURNING id",
      [foreignBusiness.id, "Proveedor exclusivo ajeno"]
    )).rows[0];

    const { default: app } = await import("../app.js");
    const { default: importedPool } = await import("../db/pool.js");
    pool = importedPool;
    const ownerAgent = await login(app, "supplier_mutation_owner", password);
    const managerAgent = await login(app, "supplier_mutation_manager", password);
    const viewerAgent = await login(app, "supplier_mutation_viewer", password);

    await t.test("owner crea y manager edita con normalización y trigger de updated_at", async () => {
      const created = await mutate(ownerAgent, "post", "/api/suppliers", {
        name: "Proveedor API normalizado",
        legalName: " ",
        taxId: "abc-01/2",
        contactName: " ",
        email: "CONTACTO@PROVEEDOR.TEST ",
        phone: "",
        address: "",
        notes: ""
      }, 201);
      const supplier = created.body.data.supplier;
      assert.equal(supplier.status, "active");
      assert.equal(supplier.legalName, null);
      assert.equal(supplier.taxId, "ABC-01/2");
      assert.equal(supplier.contactName, null);
      assert.equal(supplier.email, "contacto@proveedor.test");
      assert.equal(supplier.phone, null);
      assert.equal(supplier.address, null);
      assert.equal(supplier.notes, null);
      const originalUpdatedAt = supplier.updatedAt;

      const edit = await managerAgent.get(`/api/suppliers/${supplier.id}/edit`).expect(200).expect("Cache-Control", "no-store");
      assert.deepEqual(edit.body.data.supplier, {
        name: "Proveedor API normalizado",
        legalName: null,
        taxId: "ABC-01/2",
        contactName: null,
        email: "contacto@proveedor.test",
        phone: null,
        address: null,
        notes: null
      });
      await client.query("SELECT pg_sleep(0.05)");
      const updated = await mutate(managerAgent, "put", `/api/suppliers/${supplier.id}`, {
        name: "Proveedor API actualizado",
        legalName: "Proveedor Actualizado SA",
        taxId: "xyz.12",
        contactName: "Luz Contacto",
        email: "LUZ@PROVEEDOR.TEST",
        phone: "5550000000",
        address: "Avenida 10",
        notes: "Notas actualizadas"
      }, 200);
      assert.equal(updated.body.data.supplier.status, "active");
      assert.equal(updated.body.data.supplier.taxId, "XYZ.12");
      assert.equal(updated.body.data.supplier.email, "luz@proveedor.test");
      assert.ok(new Date(updated.body.data.supplier.updatedAt) > new Date(originalUpdatedAt));
    });

    await t.test("viewer recibe 403 y el proveedor ajeno responde 404", async () => {
      const viewerResponse = await mutate(viewerAgent, "post", "/api/suppliers", { name: "Intento de viewer" }, 403);
      assert.equal(viewerResponse.body.error.code, "FORBIDDEN");
      const foreignResponse = await mutate(ownerAgent, "put", `/api/suppliers/${foreignSupplier.id}`, { name: "No debe cambiar" }, 404);
      assert.equal(foreignResponse.body.error.code, "SUPPLIER_NOT_FOUND");
      const stored = await client.query("SELECT business_id, name FROM suppliers WHERE id = $1", [foreignSupplier.id]);
      assert.deepEqual(stored.rows[0], { business_id: foreignBusiness.id, name: "Proveedor exclusivo ajeno" });
    });

    await t.test("duplicados y campos protegidos no dejan cambios parciales; otro negocio admite el nombre", async () => {
      const original = (await client.query(
        "INSERT INTO suppliers(business_id, name) VALUES($1, $2) RETURNING id",
        [owner.business_id, "Proveedor duplicado API"]
      )).rows[0];
      const before = Number((await client.query("SELECT COUNT(*) FROM suppliers WHERE business_id = $1", [owner.business_id])).rows[0].count);
      const duplicate = await mutate(ownerAgent, "post", "/api/suppliers", { name: "PROVEEDOR DUPLICADO API" }, 409);
      assert.equal(duplicate.body.error.code, "SUPPLIER_ALREADY_EXISTS");
      const protectedField = await mutate(ownerAgent, "put", `/api/suppliers/${original.id}`, { name: "Proveedor duplicado API", status: "inactive" }, 400);
      assert.equal(protectedField.body.error.code, "VALIDATION_ERROR");
      const after = Number((await client.query("SELECT COUNT(*) FROM suppliers WHERE business_id = $1", [owner.business_id])).rows[0].count);
      assert.equal(after, before);
      const unchanged = await client.query("SELECT name, status FROM suppliers WHERE id = $1", [original.id]);
      assert.deepEqual(unchanged.rows[0], { name: "Proveedor duplicado API", status: "active" });
      const foreignSameName = await client.query(
        "INSERT INTO suppliers(business_id, name) VALUES($1, $2) RETURNING id",
        [foreignBusiness.id, "Proveedor duplicado API"]
      );
      assert.ok(foreignSameName.rows[0].id);
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
