import test from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcrypt";
import pg from "pg";
import request from "supertest";
import {
  createTestDatabase,
  dropTestDatabase,
  withTestTransaction
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

async function login(app, username, password) {
  const agent = request.agent(app);
  const csrfToken = (await agent.get("/api/csrf-token").expect(200)).body.data.csrfToken;
  await agent.post("/api/auth/login").set("x-csrf-token", csrfToken).send({ identifier: username, password }).expect(200);

  return agent;
}

async function snapshotBusiness(client, businessId) {
  const result = await client.query(
    `
      SELECT jsonb_build_object(
        'business', (SELECT to_jsonb(b) FROM businesses b WHERE b.id = $1),
        'members', (SELECT COALESCE(jsonb_agg(to_jsonb(m) ORDER BY m.id), '[]'::jsonb) FROM business_members m WHERE m.business_id = $1),
        'categories', (SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY c.id), '[]'::jsonb) FROM categories c WHERE c.business_id = $1),
        'items', (SELECT COALESCE(jsonb_agg(to_jsonb(i) ORDER BY i.id), '[]'::jsonb) FROM items i WHERE i.business_id = $1),
        'locations', (SELECT COALESCE(jsonb_agg(to_jsonb(l) ORDER BY l.id), '[]'::jsonb) FROM business_locations l WHERE l.business_id = $1),
        'suppliers', (SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.id), '[]'::jsonb) FROM suppliers s WHERE s.business_id = $1),
        'balances', (SELECT COALESCE(jsonb_agg(to_jsonb(ib) ORDER BY ib.location_id, ib.item_id), '[]'::jsonb) FROM inventory_balances ib WHERE ib.business_id = $1),
        'thresholds', (SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.id), '[]'::jsonb) FROM inventory_stock_thresholds t WHERE t.business_id = $1)
      )::text AS data
    `,
    [businessId]
  );

  return result.rows[0].data;
}

test(
  "las rutas HTTP aíslan datos por negocio",
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

      const password = "tenant-isolation-password";
      const [ownerAHash, ownerBHash] = await Promise.all([
        bcrypt.hash(password, 10),
        bcrypt.hash(password, 10)
      ]);
      const ownerAResult = await client.query(
        `
          SELECT users.id AS user_id, businesses.id AS business_id
          FROM users
          JOIN business_members ON business_members.user_id = users.id
          JOIN businesses ON businesses.id = business_members.business_id
          WHERE users.platform_role = 'super_admin'
            AND business_members.role = 'owner'
            AND business_members.status = 'active'
            AND businesses.status = 'active'
          LIMIT 1
        `
      );
      const businessA = ownerAResult.rows[0];
      assert.ok(businessA);

      await client.query(
        "UPDATE users SET username = $1, email = $2, password_hash = $3 WHERE id = $4",
        ["tenant_owner_a", "tenant-owner-a@example.test", ownerAHash, businessA.user_id]
      );
      const ownerBResult = await client.query(
        "INSERT INTO users (username, email, password_hash, platform_role) VALUES ($1, $2, $3, 'user') RETURNING id",
        ["tenant_owner_b", "tenant-owner-b@example.test", ownerBHash]
      );
      const ownerBId = ownerBResult.rows[0].id;
      const categoryAResult = await client.query(
        "INSERT INTO categories (business_id, name, description) VALUES ($1, $2, $3) RETURNING id",
        [businessA.business_id, "CATEGORIA_SOLO_NEGOCIO_A", "Categoría aislada A"]
      );
      const locationAResult = await client.query(
        "SELECT id FROM business_locations WHERE business_id = $1 AND is_default AND status = 'active'",
        [businessA.business_id]
      );
      const locationAId = locationAResult.rows[0].id;
      const businessBFixture = await withTestTransaction(client, async () => {
        const business = await client.query("INSERT INTO businesses (name, slug, created_by) VALUES ($1, $2, $3) RETURNING id", ["NEGOCIO_B_AISLADO", "negocio-b-aislado", ownerBId]);
        const businessBId = business.rows[0].id;
        await client.query("INSERT INTO business_members (business_id, user_id, role, status) VALUES ($1, $2, 'owner', 'active')", [businessBId, ownerBId]);
        const category = await client.query("INSERT INTO categories (business_id, name, description, is_default) VALUES ($1, $2, $3, true) RETURNING id", [businessBId, "CATEGORIA_SOLO_NEGOCIO_B", "Categoría aislada B"]);
        const location = await client.query("INSERT INTO business_locations (business_id, name, code, location_type, is_default) VALUES ($1, $2, $3, 'warehouse', true) RETURNING id", [businessBId, "UBICACION_SOLO_NEGOCIO_B", "B-MAIN"]);
        return { businessBId, categoryId: category.rows[0].id, locationId: location.rows[0].id };
      });
      const businessBId = businessBFixture.businessBId;
      const categoryBResult = { rows: [{ id: businessBFixture.categoryId }] };
      const locationBId = businessBFixture.locationId;

      const itemAResult = await client.query(
        `
          INSERT INTO items (business_id, category_id, sku, name, description, brand, price, stock)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING id
        `,
        [businessA.business_id, categoryAResult.rows[0].id, "SKU-A-001", "PRODUCTO_SOLO_NEGOCIO_A", "Producto aislado A", "Marca A", 10, 2]
      );
      const itemBResult = await client.query(
        `
          INSERT INTO items (business_id, category_id, sku, name, description, brand, price, stock)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING id
        `,
        [businessBId, categoryBResult.rows[0].id, "SKU-B-001", "PRODUCTO_SOLO_NEGOCIO_B", "Producto aislado B", "Marca B", 20, 3]
      );
      const itemBId = itemBResult.rows[0].id;

      await client.query(
        `
          INSERT INTO suppliers (business_id, name, status)
          VALUES ($1, $2, 'active'), ($3, $4, 'active')
        `,
        [businessA.business_id, "PROVEEDOR_SOLO_NEGOCIO_A", businessBId, "PROVEEDOR_SOLO_NEGOCIO_B"]
      );
      const supplierBResult = await client.query(
        "SELECT id FROM suppliers WHERE business_id = $1 AND name = $2",
        [businessBId, "PROVEEDOR_SOLO_NEGOCIO_B"]
      );
      const supplierBId = supplierBResult.rows[0].id;

      await client.query(
        `
          INSERT INTO inventory_balances (business_id, location_id, item_id, stock)
          VALUES ($1, $2, $3, 2), ($4, $5, $6, 3)
        `,
        [businessA.business_id, locationAId, itemAResult.rows[0].id, businessBId, locationBId, itemBId]
      );
      await client.query(
        `
          INSERT INTO inventory_stock_thresholds (business_id, item_id, location_id, minimum_stock, created_by)
          VALUES ($1, $2, $3, 5, $4), ($5, $6, $7, 5, $8)
        `,
        [businessA.business_id, itemAResult.rows[0].id, locationAId, businessA.user_id, businessBId, itemBId, locationBId, ownerBId]
      );

      const businessBSnapshot = await snapshotBusiness(client, businessBId);
      const { default: app } = await import("../app.js");
      const { default: importedPool } = await import("../db/pool.js");
      pool = importedPool;
      const ownerAAgent = await login(app, "tenant_owner_a", password);

      await t.test("productos de B no aparecen en listados ni búsquedas de A", async () => {
        const list = await ownerAAgent.get("/api/products").expect(200);
        assert.doesNotMatch(JSON.stringify(list.body), /PRODUCTO_SOLO_NEGOCIO_B|SKU-B-001/);
        const search = await ownerAAgent.get("/api/products?q=PRODUCTO_SOLO_NEGOCIO_B").expect(200);
        assert.equal(search.body.data.pagination.totalItems, 0);
        const skuSearch = await ownerAAgent.get("/api/products?q=SKU-B-001").expect(200);
        assert.equal(skuSearch.body.data.pagination.totalItems, 0);
      });

      await t.test("detalles de recursos de B responden 404", async () => {
        await ownerAAgent.get(`/api/products/${itemBId}`).expect(404);
        await ownerAAgent.get(`/api/categories/${categoryBResult.rows[0].id}`).expect(404);
        await ownerAAgent.get(`/api/suppliers/${supplierBId}`).expect(404);
        await ownerAAgent.get(`/api/locations/${locationBId}`).expect(404);
      });

      await t.test("reportes y alertas no revelan datos de B", async () => {
        const report = await ownerAAgent.get("/api/reports/inventory?stockRows=all").expect(200);
        assert.doesNotMatch(JSON.stringify(report.body), /PRODUCTO_SOLO_NEGOCIO_B|SKU-B-001|UBICACION_SOLO_NEGOCIO_B/);

        for (const filter of [
          `category=${categoryBResult.rows[0].id}`,
          `location=${locationBId}`
        ]) {
          const filtered = await ownerAAgent.get(`/api/reports/inventory?${filter}&stockRows=all`).expect(200);
          assert.doesNotMatch(JSON.stringify(filtered.body), /PRODUCTO_SOLO_NEGOCIO_B|SKU-B-001/);
        }

        const alerts = await ownerAAgent.get("/api/alerts/stock").expect(200);
        assert.doesNotMatch(JSON.stringify(alerts.body), /PRODUCTO_SOLO_NEGOCIO_B|SKU-B-001/);
      });

      await t.test("configurar un umbral de B se rechaza sin modificarlo", async () => {
        await ownerAAgent.get(`/api/products/${itemBId}/thresholds`).expect(404);
        const thresholdBefore = await client.query(
          "SELECT minimum_stock FROM inventory_stock_thresholds WHERE business_id = $1 AND item_id = $2 AND location_id = $3",
          [businessBId, itemBId, locationBId]
        );

        await ownerAAgent
          .put(`/api/products/${itemBId}/thresholds/${locationBId}`)
          .set("x-csrf-token", (await ownerAAgent.get("/api/csrf-token")).body.data.csrfToken)
          .send({ minimumStock: 999 })
          .expect(404);

        const thresholdAfter = await client.query(
          "SELECT minimum_stock FROM inventory_stock_thresholds WHERE business_id = $1 AND item_id = $2 AND location_id = $3",
          [businessBId, itemBId, locationBId]
        );
        assert.deepEqual(thresholdAfter.rows, thresholdBefore.rows);
      });

      await t.test("seleccionar B sin membresía no cambia el negocio activo", async () => {
        await ownerAAgent
          .put("/api/session/active-business")
          .set("x-csrf-token", (await ownerAAgent.get("/api/csrf-token")).body.data.csrfToken)
          .send({ businessId: businessBId })
          .expect(404);

        const list = await ownerAAgent.get("/api/products").expect(200);
        const serialized = JSON.stringify(list.body);
        assert.match(serialized, /PRODUCTO_SOLO_NEGOCIO_A|SKU-A-001/);
        assert.doesNotMatch(serialized, /PRODUCTO_SOLO_NEGOCIO_B|SKU-B-001/);
      });

      await t.test("ninguna fila de B cambia", async () => {
        assert.equal(await snapshotBusiness(client, businessBId), businessBSnapshot);
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
