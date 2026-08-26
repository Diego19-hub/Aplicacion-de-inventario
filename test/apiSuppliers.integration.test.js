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

test("listado y detalle de proveedores mediante API", { skip: !hasTestDatabaseUrl }, async (t) => {
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

    const password = "api-suppliers-password";
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
      ["suppliers_owner", "suppliers-owner@example.test", passwordHash, owner.id]
    );
    const manager = await client.query(
      "INSERT INTO users(username, email, password_hash, platform_role) VALUES($1, $2, $3, 'user') RETURNING id",
      ["suppliers_manager", "suppliers-manager@example.test", passwordHash]
    );
    const viewer = await client.query(
      "INSERT INTO users(username, email, password_hash, platform_role) VALUES($1, $2, $3, 'user') RETURNING id",
      ["suppliers_viewer", "suppliers-viewer@example.test", passwordHash]
    );
    const foreignUser = await client.query(
      "INSERT INTO users(username, email, password_hash, platform_role) VALUES($1, $2, $3, 'user') RETURNING id",
      ["suppliers_foreign", "suppliers-foreign@example.test", passwordHash]
    );
    await client.query(
      `INSERT INTO business_members(business_id, user_id, role, status)
       VALUES($1, $2, 'manager', 'active'), ($1, $3, 'viewer', 'active')`,
      [owner.business_id, manager.rows[0].id, viewer.rows[0].id]
    );

    const ownSupplier = (await client.query(
      `
        INSERT INTO suppliers(
          business_id, name, legal_name, tax_id, contact_name, email, phone,
          address, notes, status
        ) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active')
        RETURNING id
      `,
      [owner.business_id, "Proveedor principal API", "Proveedor Principal SA", "PPA010101AA1", "Ana Contacto", "ana@proveedor.test", "5550000000", "Avenida Principal 1", "Notas seguras"]
    )).rows[0];
    await client.query(
      "INSERT INTO suppliers(business_id, name, status) VALUES($1, $2, 'inactive')",
      [owner.business_id, "Proveedor inactivo API"]
    );
    for (let index = 1; index <= 20; index += 1) {
      await client.query(
        "INSERT INTO suppliers(business_id, name, status) VALUES($1, $2, 'active')",
        [owner.business_id, `Proveedor paginación ${String(index).padStart(2, "0")}`]
      );
    }

    await client.query("BEGIN");
    let foreignBusiness;
    try {
      foreignBusiness = (await client.query(
        "INSERT INTO businesses(name, slug, created_by, status) VALUES($1, $2, $3, 'active') RETURNING id",
        ["Negocio ajeno proveedores", "negocio-ajeno-proveedores", foreignUser.rows[0].id]
      )).rows[0];
      await client.query("INSERT INTO business_members(business_id, user_id, role, status) VALUES($1, $2, 'owner', 'active')", [foreignBusiness.id, foreignUser.rows[0].id]);
      await client.query("INSERT INTO categories(business_id, name, description, is_default) VALUES($1, 'General', 'Categoría predeterminada', true)", [foreignBusiness.id]);
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    const foreignSupplier = (await client.query(
      "INSERT INTO suppliers(business_id, name, email, status) VALUES($1, $2, $3, 'active') RETURNING id",
      [foreignBusiness.id, "Proveedor exclusivo ajeno", "ajeno@proveedor.test"]
    )).rows[0];

    const { default: app } = await import("../app.js");
    const { default: importedPool } = await import("../db/pool.js");
    pool = importedPool;
    const ownerAgent = await login(app, "suppliers_owner", password);
    const managerAgent = await login(app, "suppliers_manager", password);
    const viewerAgent = await login(app, "suppliers_viewer", password);

    await t.test("owner, manager y viewer listan únicamente proveedores propios", async () => {
      for (const agent of [ownerAgent, managerAgent, viewerAgent]) {
        const response = await agent.get("/api/suppliers?q=Proveedor%20principal%20API").expect(200).expect("Cache-Control", "no-store");
        assert.equal(response.body.data.suppliers.length, 1);
        const supplier = response.body.data.suppliers[0];
        assert.equal(supplier.id, ownSupplier.id);
        assert.equal(supplier.taxId, "PPA010101AA1");
        assert.equal(supplier.email, "ana@proveedor.test");
        assert.equal(Object.hasOwn(supplier, "businessId"), false);
      }
    });

    await t.test("búsqueda, estado y paginación mantienen conteo y resultados", async () => {
      const contactSearch = await ownerAgent.get("/api/suppliers?q=Ana%20Contacto&status=all").expect(200);
      assert.equal(contactSearch.body.data.pagination.totalItems, 1);
      assert.equal(contactSearch.body.data.suppliers[0].id, ownSupplier.id);
      const inactive = await ownerAgent.get("/api/suppliers?status=inactive").expect(200);
      assert.equal(inactive.body.data.pagination.totalItems, 1);
      assert.equal(inactive.body.data.suppliers[0].status, "inactive");
      const firstPage = await ownerAgent.get("/api/suppliers?status=active&page=1").expect(200);
      const secondPage = await ownerAgent.get("/api/suppliers?status=active&page=2").expect(200);
      assert.equal(firstPage.body.data.suppliers.length, 20);
      assert.ok(firstPage.body.data.pagination.totalItems > 20);
      assert.ok(secondPage.body.data.suppliers.length > 0);
      const normalized = await ownerAgent.get("/api/suppliers?status=otro&page=1.5").expect(200);
      assert.deepEqual(normalized.body.data.filters, { q: "", status: "active" });
      assert.equal(normalized.body.data.pagination.page, 1);
    });

    await t.test("detalle propio devuelve campos seguros; ajeno e ID inválido fallan", async () => {
      const detail = await ownerAgent.get(`/api/suppliers/${ownSupplier.id}`).expect(200);
      assert.deepEqual(detail.body.data.supplier, {
        id: ownSupplier.id,
        name: "Proveedor principal API",
        legalName: "Proveedor Principal SA",
        taxId: "PPA010101AA1",
        contactName: "Ana Contacto",
        email: "ana@proveedor.test",
        phone: "5550000000",
        address: "Avenida Principal 1",
        notes: "Notas seguras",
        status: "active",
        createdAt: detail.body.data.supplier.createdAt,
        updatedAt: detail.body.data.supplier.updatedAt
      });
      assert.equal(Object.hasOwn(detail.body.data.supplier, "businessId"), false);
      await ownerAgent.get(`/api/suppliers/${foreignSupplier.id}`).expect(404).expect((response) => assert.equal(response.body.error.code, "SUPPLIER_NOT_FOUND"));
      await ownerAgent.get("/api/suppliers/no-es-id").expect(400).expect((response) => assert.equal(response.body.error.code, "VALIDATION_ERROR"));
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
