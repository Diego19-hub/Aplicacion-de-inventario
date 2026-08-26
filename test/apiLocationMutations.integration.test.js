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

async function mutate(agent, method, path, body, expectedStatus) {
  const token = await csrfToken(agent);
  return agent[method](path)
    .set("x-csrf-token", token)
    .send(body)
    .expect(expectedStatus);
}

test("creación y edición de ubicaciones mediante API", { skip: !hasTestDatabaseUrl }, async (t) => {
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

    const password = "api-location-mutations-password";
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
      ["location_mutation_owner", "location-mutation-owner@example.test", passwordHash, owner.id]
    );

    const manager = await client.query(
      "INSERT INTO users(username, email, password_hash, platform_role) VALUES($1, $2, $3, 'user') RETURNING id",
      ["location_mutation_manager", "location-mutation-manager@example.test", passwordHash]
    );
    const viewer = await client.query(
      "INSERT INTO users(username, email, password_hash, platform_role) VALUES($1, $2, $3, 'user') RETURNING id",
      ["location_mutation_viewer", "location-mutation-viewer@example.test", passwordHash]
    );
    const foreignUser = await client.query(
      "INSERT INTO users(username, email, password_hash, platform_role) VALUES($1, $2, $3, 'user') RETURNING id",
      ["location_mutation_foreign", "location-mutation-foreign@example.test", passwordHash]
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
        ["Negocio ajeno ubicaciones mutación", "negocio-ajeno-ubicaciones-mutacion", foreignUser.rows[0].id]
      )).rows[0];
      await client.query("INSERT INTO business_members(business_id, user_id, role, status) VALUES($1, $2, 'owner', 'active')", [foreignBusiness.id, foreignUser.rows[0].id]);
      await client.query("INSERT INTO categories(business_id, name, description, is_default) VALUES($1, 'General', 'Categoría predeterminada', true)", [foreignBusiness.id]);
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    const foreignLocation = (await client.query(
      "INSERT INTO business_locations(business_id, name, code, location_type) VALUES($1, $2, $3, 'warehouse') RETURNING id",
      [foreignBusiness.id, "Bodega ajena mutación", "AJENA-MUT"]
    )).rows[0];
    const duplicateLocation = (await client.query(
      "INSERT INTO business_locations(business_id, name, code, location_type) VALUES($1, $2, $3, 'branch') RETURNING id",
      [owner.business_id, "Ubicación duplicada", "DUP-LOC"]
    )).rows[0];

    const { default: app } = await import("../app.js");
    const { default: importedPool } = await import("../db/pool.js");
    pool = importedPool;
    const ownerAgent = await login(app, "location_mutation_owner", password);
    const managerAgent = await login(app, "location_mutation_manager", password);
    const viewerAgent = await login(app, "location_mutation_viewer", password);

    await t.test("owner crea y edita normalizando código y opcionales", async () => {
      const created = await mutate(ownerAgent, "post", "/api/locations", {
        name: "Bodega norte API",
        code: "north-api",
        locationType: "warehouse",
        address: " ",
        phone: "",
        notes: ""
      }, 201);
      const location = created.body.data.location;
      assert.deepEqual(location, {
        id: location.id,
        name: "Bodega norte API",
        code: "NORTH-API",
        locationType: "warehouse",
        status: "active",
        isDefault: false,
        address: null,
        phone: null,
        notes: null
      });
      const edit = await ownerAgent.get(`/api/locations/${location.id}/edit`).expect(200).expect("Cache-Control", "no-store");
      assert.equal(edit.body.data.location.code, "NORTH-API");
      const updated = await mutate(ownerAgent, "put", `/api/locations/${location.id}`, {
        name: "Bodega norte actualizada",
        code: "north-edit",
        locationType: "branch",
        address: "Avenida 10",
        phone: "5550000000",
        notes: "Nota operativa"
      }, 200);
      assert.equal(updated.body.data.location.code, "NORTH-EDIT");
      assert.equal(updated.body.data.location.locationType, "branch");
      const stored = await client.query(
        "SELECT status, is_default, address, phone, notes FROM business_locations WHERE id = $1 AND business_id = $2",
        [location.id, owner.business_id]
      );
      assert.deepEqual(stored.rows[0], {
        status: "active",
        is_default: false,
        address: "Avenida 10",
        phone: "5550000000",
        notes: "Nota operativa"
      });
    });

    await t.test("manager y viewer reciben 403; ubicación ajena responde 404", async () => {
      for (const agent of [managerAgent, viewerAgent]) {
        const response = await mutate(agent, "post", "/api/locations", {
          name: "Intento no autorizado",
          code: "NO-AUTH",
          locationType: "branch"
        }, 403);
        assert.equal(response.body.error.code, "FORBIDDEN");
      }
      const foreign = await mutate(ownerAgent, "put", `/api/locations/${foreignLocation.id}`, {
        name: "No debe cambiar",
        code: "NO-CAMBIA",
        locationType: "branch"
      }, 404);
      assert.equal(foreign.body.error.code, "LOCATION_NOT_FOUND");
      const stored = await client.query("SELECT business_id, name FROM business_locations WHERE id = $1", [foreignLocation.id]);
      assert.deepEqual(stored.rows[0], { business_id: foreignBusiness.id, name: "Bodega ajena mutación" });
    });

    await t.test("duplicados y campos protegidos fallan sin cambios parciales", async () => {
      const before = Number((await client.query("SELECT COUNT(*) FROM business_locations WHERE business_id = $1", [owner.business_id])).rows[0].count);
      const duplicate = await mutate(ownerAgent, "post", "/api/locations", {
        name: "UBICACIÓN DUPLICADA",
        code: "NUEVO-CODIGO",
        locationType: "branch"
      }, 409);
      assert.equal(duplicate.body.error.code, "LOCATION_ALREADY_EXISTS");
      assert.equal(duplicate.body.error.fields[0].field, "name");
      const protectedField = await mutate(ownerAgent, "put", `/api/locations/${duplicateLocation.id}`, {
        name: "Ubicación duplicada",
        code: "DUP-LOC",
        locationType: "branch",
        status: "inactive"
      }, 400);
      assert.equal(protectedField.body.error.code, "VALIDATION_ERROR");
      const after = Number((await client.query("SELECT COUNT(*) FROM business_locations WHERE business_id = $1", [owner.business_id])).rows[0].count);
      assert.equal(after, before);
      const unchanged = await client.query("SELECT status, name, code FROM business_locations WHERE id = $1", [duplicateLocation.id]);
      assert.deepEqual(unchanged.rows[0], { status: "active", name: "Ubicación duplicada", code: "DUP-LOC" });
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
