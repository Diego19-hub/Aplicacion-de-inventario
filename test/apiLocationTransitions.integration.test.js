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

async function transition(agent, locationId, action, expectedStatus) {
  const token = await csrfToken(agent);
  return agent.post(`/api/locations/${locationId}/${action}`).set("x-csrf-token", token).send({}).expect(expectedStatus);
}

test("transiciones de ubicaciones mediante API", { skip: !hasTestDatabaseUrl }, async (t) => {
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

    const password = "api-location-transitions-password";
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
      ["location_transition_owner", "location-transition-owner@example.test", passwordHash, owner.id]
    );
    const manager = await client.query(
      "INSERT INTO users(username, email, password_hash, platform_role) VALUES($1, $2, $3, 'user') RETURNING id",
      ["location_transition_manager", "location-transition-manager@example.test", passwordHash]
    );
    const viewer = await client.query(
      "INSERT INTO users(username, email, password_hash, platform_role) VALUES($1, $2, $3, 'user') RETURNING id",
      ["location_transition_viewer", "location-transition-viewer@example.test", passwordHash]
    );
    const foreignUser = await client.query(
      "INSERT INTO users(username, email, password_hash, platform_role) VALUES($1, $2, $3, 'user') RETURNING id",
      ["location_transition_foreign", "location-transition-foreign@example.test", passwordHash]
    );
    await client.query(
      `INSERT INTO business_members(business_id, user_id, role, status)
       VALUES($1, $2, 'manager', 'active'), ($1, $3, 'viewer', 'active')`,
      [owner.business_id, manager.rows[0].id, viewer.rows[0].id]
    );

    const makeDefaultTarget = (await client.query(
      "INSERT INTO business_locations(business_id, name, code, location_type) VALUES($1, $2, $3, 'warehouse') RETURNING id",
      [owner.business_id, "Principal nueva API", "PRINCIPAL-NUEVA"]
    )).rows[0];
    const emptyLocation = (await client.query(
      "INSERT INTO business_locations(business_id, name, code, location_type) VALUES($1, $2, $3, 'branch') RETURNING id",
      [owner.business_id, "Vacía API", "VACIA-API"]
    )).rows[0];
    const stockedLocation = (await client.query(
      "INSERT INTO business_locations(business_id, name, code, location_type) VALUES($1, $2, $3, 'warehouse') RETURNING id",
      [owner.business_id, "Con stock API", "STOCK-API"]
    )).rows[0];
    const category = (await client.query(
      "INSERT INTO categories(name, description, business_id) VALUES($1, $2, $3) RETURNING id",
      ["Categoría transiciones", "Categoría de prueba", owner.business_id]
    )).rows[0];
    const item = (await client.query(
      `INSERT INTO items(sku, name, description, brand, price, stock, category_id, business_id, status)
       VALUES($1, $2, $3, $4, $5, $6, $7, $8, 'active') RETURNING id`,
      ["TRANS-001", "Producto de transición", "Producto para prueba", "Marca", 10, 3, category.id, owner.business_id]
    )).rows[0];
    await client.query(
      "INSERT INTO inventory_balances(business_id, location_id, item_id, stock) VALUES($1, $2, $3, 3)",
      [owner.business_id, stockedLocation.id, item.id]
    );

    const foreignBusiness = (await client.query(
      "INSERT INTO businesses(name, slug, created_by, status) VALUES($1, $2, $3, 'active') RETURNING id",
      ["Negocio ajeno transiciones", "negocio-ajeno-transiciones", foreignUser.rows[0].id]
    )).rows[0];
    await client.query(
      "INSERT INTO business_members(business_id, user_id, role, status) VALUES($1, $2, 'owner', 'active')",
      [foreignBusiness.id, foreignUser.rows[0].id]
    );
    const foreignLocation = (await client.query(
      "INSERT INTO business_locations(business_id, name, code, location_type) VALUES($1, $2, $3, 'branch') RETURNING id",
      [foreignBusiness.id, "Ubicación ajena transición", "AJENA-TRANS"]
    )).rows[0];

    const { default: app } = await import("../app.js");
    const { default: importedPool } = await import("../db/pool.js");
    pool = importedPool;
    const ownerAgent = await login(app, "location_transition_owner", password);
    const managerAgent = await login(app, "location_transition_manager", password);
    const viewerAgent = await login(app, "location_transition_viewer", password);

    await t.test("owner cambia la principal transaccionalmente y queda exactamente una activa", async () => {
      const response = await transition(ownerAgent, makeDefaultTarget.id, "make-default", 200);
      assert.deepEqual(response.body.data.location, {
        id: makeDefaultTarget.id,
        name: "Principal nueva API",
        code: "PRINCIPAL-NUEVA",
        status: "active",
        isDefault: true
      });
      const defaults = await client.query(
        "SELECT id FROM business_locations WHERE business_id = $1 AND is_default AND status = 'active'",
        [owner.business_id]
      );
      assert.deepEqual(defaults.rows, [{ id: makeDefaultTarget.id }]);
      const secondAttempt = await transition(ownerAgent, makeDefaultTarget.id, "make-default", 409);
      assert.equal(secondAttempt.body.error.code, "LOCATION_ALREADY_DEFAULT");
    });

    await t.test("desactivación rechaza principal y stock; permite vacía y bloquea segundo intento", async () => {
      const defaultLocation = (await client.query(
        "SELECT id FROM business_locations WHERE business_id = $1 AND is_default",
        [owner.business_id]
      )).rows[0];
      const defaultAttempt = await transition(ownerAgent, defaultLocation.id, "deactivate", 409);
      assert.equal(defaultAttempt.body.error.code, "DEFAULT_LOCATION_REQUIRED");
      const stockAttempt = await transition(ownerAgent, stockedLocation.id, "deactivate", 409);
      assert.equal(stockAttempt.body.error.code, "LOCATION_HAS_STOCK");
      const deactivated = await transition(ownerAgent, emptyLocation.id, "deactivate", 200);
      assert.equal(deactivated.body.data.location.status, "inactive");
      const secondAttempt = await transition(ownerAgent, emptyLocation.id, "deactivate", 409);
      assert.equal(secondAttempt.body.error.code, "LOCATION_ALREADY_INACTIVE");
    });

    await t.test("reactivación funciona; segundo intento, roles y ubicación ajena fallan sin cambios", async () => {
      const reactivated = await transition(ownerAgent, emptyLocation.id, "reactivate", 200);
      assert.deepEqual(reactivated.body.data.location, {
        id: emptyLocation.id,
        name: "Vacía API",
        code: "VACIA-API",
        status: "active",
        isDefault: false
      });
      const secondAttempt = await transition(ownerAgent, emptyLocation.id, "reactivate", 409);
      assert.equal(secondAttempt.body.error.code, "LOCATION_ALREADY_ACTIVE");
      for (const agent of [managerAgent, viewerAgent]) {
        const response = await transition(agent, emptyLocation.id, "deactivate", 403);
        assert.equal(response.body.error.code, "FORBIDDEN");
      }
      const foreign = await transition(ownerAgent, foreignLocation.id, "deactivate", 404);
      assert.equal(foreign.body.error.code, "LOCATION_NOT_FOUND");
      const unchanged = await client.query("SELECT status FROM business_locations WHERE id = $1", [foreignLocation.id]);
      assert.equal(unchanged.rows[0].status, "active");
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
