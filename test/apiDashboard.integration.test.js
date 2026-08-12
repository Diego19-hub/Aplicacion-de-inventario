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

async function apiLogin(app, identifier, password) {
  const agent = request.agent(app);
  const token = (await agent.get("/api/csrf-token").expect(200)).body.data.csrfToken;
  await agent.post("/api/auth/login").set("x-csrf-token", token).send({ identifier, password }).expect(200);
  return agent;
}

test(
  "GET /api/dashboard",
  { skip: !hasTestDatabaseUrl },
  async (t) => {
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

      const password = "api-dashboard-password";
      const passwordHash = await bcrypt.hash(password, 10);
      const ownerResult = await client.query(
        `SELECT u.id, b.id AS business_id FROM users u JOIN business_members bm ON bm.user_id=u.id JOIN businesses b ON b.id=bm.business_id WHERE u.platform_role='super_admin' AND bm.role='owner' AND bm.status='active' AND b.status='active' LIMIT 1`
      );
      const owner = ownerResult.rows[0];
      assert.ok(owner);
      await client.query("UPDATE users SET username=$1,email=$2,password_hash=$3 WHERE id=$4", ["dashboard_owner", "dashboard-owner@example.test", passwordHash, owner.id]);
      const locationResult = await client.query("SELECT id FROM business_locations WHERE business_id=$1 AND status='active' ORDER BY id LIMIT 1", [owner.business_id]);
      const locationId = locationResult.rows[0].id;
      const category = await client.query("INSERT INTO categories (name, description, business_id) VALUES ($1,$2,$3) RETURNING id", ["Categoría dashboard", "Datos de dashboard", owner.business_id]);
      const item = await client.query("INSERT INTO items (sku,name,description,brand,price,stock,category_id,business_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id", ["DASH-001", "Producto del negocio activo", "Producto de prueba", "Marca", 12.5, 4, category.rows[0].id, owner.business_id]);
      await client.query("INSERT INTO inventory_balances (business_id,location_id,item_id,stock) VALUES ($1,$2,$3,$4)", [owner.business_id, locationId, item.rows[0].id, 4]);
      await client.query("INSERT INTO inventory_movements (business_id,location_id,item_id,movement_type,quantity_delta,previous_stock,resulting_stock,reason,created_by) VALUES ($1,$2,$3,'opening_balance',4,0,4,$4,$5)", [owner.business_id, locationId, item.rows[0].id, "Saldo inicial de dashboard", owner.id]);
      await client.query("INSERT INTO inventory_stock_thresholds (business_id,item_id,location_id,minimum_stock,created_by) VALUES ($1,$2,$3,$4,$5)", [owner.business_id, item.rows[0].id, locationId, 4, owner.id]);

      const noBusiness = await client.query("INSERT INTO users (username,email,password_hash,platform_role) VALUES ($1,$2,$3,'user') RETURNING id", ["dashboard_without_business", "dashboard-without-business@example.test", passwordHash]);
      const foreignUser = await client.query("INSERT INTO users (username,email,password_hash,platform_role) VALUES ($1,$2,$3,'user') RETURNING id", ["dashboard_foreign_owner", "dashboard-foreign-owner@example.test", passwordHash]);
      const foreignBusiness = await client.query("INSERT INTO businesses (name,slug,created_by,status) VALUES ($1,$2,$3,'active') RETURNING id", ["Negocio ajeno dashboard", "negocio-ajeno-dashboard", foreignUser.rows[0].id]);
      const foreignBusinessId = foreignBusiness.rows[0].id;
      await client.query("INSERT INTO business_members (business_id,user_id,role,status) VALUES ($1,$2,'owner','active')", [foreignBusinessId, foreignUser.rows[0].id]);
      const foreignLocation = await client.query("INSERT INTO business_locations (business_id,name,code,location_type,status,is_default) VALUES ($1,$2,$3,'branch','active',true) RETURNING id", [foreignBusinessId, "Ubicación ajena", "FOREIGN"]);
      const foreignCategory = await client.query("INSERT INTO categories (name,description,business_id) VALUES ($1,$2,$3) RETURNING id", ["Categoría ajena dashboard", "Datos ajenos", foreignBusinessId]);
      const foreignItem = await client.query("INSERT INTO items (sku,name,description,brand,price,stock,category_id,business_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id", ["FOREIGN-001", "Producto ajeno dashboard", "Producto ajeno", "Marca", 99, 9, foreignCategory.rows[0].id, foreignBusinessId]);
      await client.query("INSERT INTO inventory_balances (business_id,location_id,item_id,stock) VALUES ($1,$2,$3,$4)", [foreignBusinessId, foreignLocation.rows[0].id, foreignItem.rows[0].id, 9]);
      await client.query("INSERT INTO inventory_movements (business_id,location_id,item_id,movement_type,quantity_delta,previous_stock,resulting_stock,reason,created_by) VALUES ($1,$2,$3,'opening_balance',9,0,9,$4,$5)", [foreignBusinessId, foreignLocation.rows[0].id, foreignItem.rows[0].id, "Saldo inicial ajeno dashboard", foreignUser.rows[0].id]);

      const { default: app } = await import("../app.js");
      const { default: importedPool } = await import("../db/pool.js");
      pool = importedPool;

      await t.test("usuario anónimo recibe 401", async () => {
        const response = await request(app).get("/api/dashboard").expect(401).expect("Content-Type", /application\/json/);
        assert.equal(response.body.error.code, "AUTH_REQUIRED");
      });

      await t.test("negocio activo recibe métricas y movimientos aislados", async () => {
        const agent = await apiLogin(app, "dashboard_owner", password);
        const response = await agent.get("/api/dashboard").expect(200).expect("Cache-Control", "no-store");
        assert.deepEqual(response.body.data.summary, { activeProducts: 1, totalUnits: 4, inventoryValue: 50, lowStockAlerts: 1, activeLocations: 1 });
        assert.equal(response.body.data.recentMovements.length, 1);
        assert.equal(response.body.data.recentMovements[0].itemName, "Producto del negocio activo");
        assert.equal(JSON.stringify(response.body).includes("Producto ajeno dashboard"), false);
        assert.equal(JSON.stringify(response.body).includes("FOREIGN-001"), false);
        assert.deepEqual(response.body.data.stockByLocation, [{ id: locationId, name: "Sucursal principal", code: "MAIN", totalStock: 4 }]);
      });

      await t.test("usuario sin negocio activo recibe 409 controlado", async () => {
        const agent = await apiLogin(app, "dashboard_without_business", password);
        const response = await agent.get("/api/dashboard").expect(409).expect("Content-Type", /application\/json/);
        assert.equal(response.body.error.code, "ACTIVE_BUSINESS_REQUIRED");
      });
    } finally {
      if (client) await client.end();
      if (pool) await pool.end();
      if (originalEnvironment.DATABASE_URL === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = originalEnvironment.DATABASE_URL;
      if (databaseCreated) await dropTestDatabase();
      restoreEnvironment();
    }
  }
);
