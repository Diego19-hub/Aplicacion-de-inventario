import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";

import { createTestDatabase, dropTestDatabase, withTestTransaction } from "./helpers/testDatabase.js";

const { Client } = pg;
const hasTestDatabaseUrl = Boolean(process.env.TEST_DATABASE_URL);

function barrier(parties) {
  let arrived = 0;
  let release;
  const allArrived = new Promise((resolve) => { release = resolve; });
  return async () => {
    arrived += 1;
    if (arrived === parties) release();
    await allArrived;
  };
}

async function runAtBarrier(connectionString, operations) {
  const wait = barrier(operations.length);
  return Promise.all(operations.map(async (operation) => {
    const worker = new Client({ connectionString });
    await worker.connect();
    const pid = Number((await worker.query("SELECT pg_backend_pid() AS pid")).rows[0].pid);
    try {
      await wait();
      try {
        return { pid, ok: true, value: await operation() };
      } catch (error) {
        return { pid, ok: false, error };
      }
    } finally {
      await worker.end();
    }
  }));
}

async function createFixture(client, owner, suffix, { valuationMethod = "fifo", stock = 0 } = {}) {
  const category = (await client.query(
    `INSERT INTO categories (business_id, name, description, is_default)
     VALUES ($1, $2, 'Pruebas de concurrencia', false) RETURNING id`,
    [owner.businessId, `Concurrencia ${suffix}`]
  )).rows[0];
  const location = (await client.query(
    `SELECT id FROM business_locations
     WHERE business_id = $1 AND status = 'active'
     ORDER BY is_default DESC, id LIMIT 1`,
    [owner.businessId]
  )).rows[0];
  assert.ok(location, "El negocio de prueba requiere una ubicación activa.");
  const item = (await client.query(
    `INSERT INTO items
       (business_id, category_id, sku, name, description, brand, price, cost_price, stock, status)
     VALUES ($1, $2, $3, $4, 'Concurrencia', 'Pruebas', 100, 0, $5, 'active')
     RETURNING id`,
    [owner.businessId, category.id, `CON-${suffix}`, `Producto concurrencia ${suffix}`, stock]
  )).rows[0];
  await client.query(
    "UPDATE businesses SET inventory_valuation_method = $1 WHERE id = $2",
    [valuationMethod, owner.businessId]
  );
  await client.query(
    `INSERT INTO inventory_balances (business_id, location_id, item_id, stock)
     VALUES ($1, $2, $3, $4)`,
    [owner.businessId, location.id, item.id, stock]
  );
  return { itemId: Number(item.id), locationId: Number(location.id) };
}

async function counts(client, businessId, itemId) {
  const result = await client.query(
    `SELECT
       (SELECT COUNT(DISTINCT s.id)::int
          FROM sales s
          INNER JOIN sale_items si ON (si.business_id, si.sale_id) = (s.business_id, s.id)
         WHERE s.business_id = $1 AND si.item_id = $2) AS sales,
       (SELECT COUNT(*)::int FROM inventory_transfers WHERE business_id = $1 AND item_id = $2) AS transfers,
       (SELECT COUNT(*)::int FROM inventory_movements WHERE business_id = $1 AND item_id = $2) AS movements,
       (SELECT COUNT(*)::int
          FROM inventory_layer_consumptions ilc
          INNER JOIN inventory_cost_layers icl
            ON (icl.business_id, icl.id) = (ilc.business_id, ilc.layer_id)
         WHERE icl.business_id = $1 AND icl.item_id = $2) AS consumptions,
       (SELECT COUNT(*)::int FROM audit_log WHERE business_id = $1) AS audits`,
    [businessId, itemId]
  );
  return result.rows[0];
}

async function assertLayerIntegrity(client, businessId, itemId) {
  const rows = (await client.query(
    `SELECT l.quantity_original, l.quantity_available,
            COALESCE(SUM(c.quantity), 0) AS consumed
     FROM inventory_cost_layers l
     LEFT JOIN inventory_layer_consumptions c
       ON (c.business_id, c.layer_id) = (l.business_id, l.id)
     WHERE l.business_id = $1 AND l.item_id = $2
     GROUP BY l.id
     ORDER BY l.received_at, l.id`,
    [businessId, itemId]
  )).rows;
  for (const row of rows) {
    assert.ok(Number(row.quantity_available) >= 0, "Una capa FIFO no puede quedar negativa.");
    assert.ok(Number(row.consumed) >= 0, "Un consumo FIFO no puede ser negativo.");
    assert.ok(Number(row.consumed) <= Number(row.quantity_original), "Los consumos no superan la capa original.");
    assert.equal(Number(row.quantity_available) + Number(row.consumed), Number(row.quantity_original));
  }
}

test(
  "concurrencia FIFO conserva stock, capas, rollback y aislamiento multiempresa",
  { skip: !hasTestDatabaseUrl, timeout: 30_000 },
  async () => {
    let setup;
    let databaseCreated = false;
    let applicationPool;
    const originalDatabaseUrl = process.env.DATABASE_URL;
    try {
      await createTestDatabase();
      databaseCreated = true;
      process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

      setup = new Client({ connectionString: process.env.TEST_DATABASE_URL });
      await setup.connect();
      const ownerRow = (await setup.query(
        `SELECT b.id AS business_id, bm.user_id
         FROM businesses b
         INNER JOIN business_members bm ON bm.business_id = b.id
         WHERE b.status = 'active' AND bm.role = 'owner' AND bm.status = 'active'
         ORDER BY b.id LIMIT 1`
      )).rows[0];
      assert.ok(ownerRow);
      const owner = { businessId: Number(ownerRow.business_id), userId: Number(ownerRow.user_id) };
      const foreignFixture = await withTestTransaction(setup, async () => {
        const foreignUser = (await setup.query(
          `INSERT INTO users (username, email, password_hash, platform_role)
           VALUES ('concurrency-foreign', 'concurrency-foreign@example.test', 'test-hash', 'user')
           RETURNING id`
        )).rows[0];
        const foreignBusiness = (await setup.query(
          `INSERT INTO businesses (name, slug, created_by, status)
           VALUES ('Negocio concurrencia ajeno', 'concurrency-foreign', $1, 'active') RETURNING id`,
          [foreignUser.id]
        )).rows[0];
        await setup.query(
          "INSERT INTO business_members (business_id, user_id, role, status) VALUES ($1, $2, 'owner', 'active')",
          [foreignBusiness.id, foreignUser.id]
        );
        const foreignCategory = (await setup.query(
          `INSERT INTO categories (business_id, name, description, is_default)
           VALUES ($1, 'General ajena', 'Concurrencia', true) RETURNING id`,
          [foreignBusiness.id]
        )).rows[0];
        const foreignLocation = (await setup.query(
          `INSERT INTO business_locations (business_id, name, code, location_type, status, is_default)
           VALUES ($1, 'Ubicación ajena', 'CON-FOREIGN', 'warehouse', 'active', true) RETURNING id`,
          [foreignBusiness.id]
        )).rows[0];
        const foreignItem = (await setup.query(
          `INSERT INTO items (business_id, category_id, sku, name, description, brand, price, cost_price, stock, status)
           VALUES ($1, $2, 'CON-FOREIGN-ITEM', 'Producto ajeno concurrencia', 'Concurrencia', 'Pruebas', 100, 0, 0, 'active') RETURNING id`,
          [foreignBusiness.id, foreignCategory.id]
        )).rows[0];
        await setup.query(
          "UPDATE businesses SET inventory_valuation_method = 'average' WHERE id = $1",
          [foreignBusiness.id]
        );
        await setup.query(
          "INSERT INTO inventory_balances (business_id, location_id, item_id, stock) VALUES ($1, $2, $3, 0)",
          [foreignBusiness.id, foreignLocation.id, foreignItem.id]
        );
        const ownerCheck = await setup.query(
          `SELECT COUNT(*)::int AS count
           FROM business_members
           WHERE business_id = $1 AND role = 'owner' AND status = 'active'`,
          [foreignBusiness.id]
        );
        const categoryCheck = await setup.query(
          "SELECT COUNT(*)::int AS count FROM categories WHERE business_id = $1 AND is_default",
          [foreignBusiness.id]
        );
        assert.equal(ownerCheck.rows[0].count, 1);
        assert.equal(categoryCheck.rows[0].count, 1);
        return {
          owner: { businessId: Number(foreignBusiness.id), userId: Number(foreignUser.id) },
          locationId: Number(foreignLocation.id),
          itemId: Number(foreignItem.id)
        };
      });

      const [saleFixture, exitFixture, transferFixture, productionFixture, isolatedFixture] = await Promise.all([
        createFixture(setup, owner, "SALE", { stock: 0 }),
        createFixture(setup, owner, "EXIT", { stock: 0 }),
        createFixture(setup, owner, "TRANSFER", { stock: 0 }),
        createFixture(setup, owner, "PRODUCTION-ING", { stock: 0 }),
        createFixture(setup, owner, "ISOLATED", { stock: 0 })
      ]);
      const { owner: foreignOwner, locationId: foreignLocationId, itemId: foreignItemId } = foreignFixture;
      const foreignOwnerCount = await setup.query(
        `SELECT COUNT(*)::int AS count
         FROM business_members
         WHERE business_id = $1 AND role = 'owner' AND status = 'active'`,
        [foreignOwner.businessId]
      );
      const foreignDefaultCategoryCount = await setup.query(
        "SELECT COUNT(*)::int AS count FROM categories WHERE business_id = $1 AND is_default",
        [foreignOwner.businessId]
      );
      assert.equal(foreignOwnerCount.rows[0].count, 1);
      assert.equal(foreignDefaultCategoryCount.rows[0].count, 1);

      const [
        { createInventoryEntry, createInventoryExit },
        { createInventoryTransfer },
        { produceRecipe },
        { createPosSale },
        { default: importedPool }
      ] = await Promise.all([
        import("../db/inventoryTransactionQueries.js"),
        import("../db/transferQueries.js"),
        import("../db/recipeQueries.js"),
        import("../db/apiSaleQueries.js"),
        import("../db/pool.js")
      ]);
      applicationPool = importedPool;

      await createInventoryEntry({ businessId: owner.businessId, userId: owner.userId, locationId: saleFixture.locationId, lines: [{ itemId: saleFixture.itemId, quantity: 5, unitCost: "2.00" }] });
      const saleCountsBefore = await counts(setup, owner.businessId, saleFixture.itemId);
      const saleResults = await runAtBarrier(process.env.TEST_DATABASE_URL, [
        () => createPosSale({ businessId: owner.businessId, userId: owner.userId, locationId: saleFixture.locationId, paymentMethod: "card", amountReceived: 0, items: [{ itemId: saleFixture.itemId, quantity: 3 }] }),
        () => createPosSale({ businessId: owner.businessId, userId: owner.userId, locationId: saleFixture.locationId, paymentMethod: "card", amountReceived: 0, items: [{ itemId: saleFixture.itemId, quantity: 3 }] })
      ]);
      assert.equal(new Set(saleResults.map((result) => result.pid)).size, 2);
      assert.equal(saleResults.filter((result) => result.ok).length, 1);
      assert.equal(saleResults.filter((result) => !result.ok && result.error.code === "POS_INSUFFICIENT_STOCK").length, 1);
      const saleCountsAfter = await counts(setup, owner.businessId, saleFixture.itemId);
      assert.equal(Number(saleCountsAfter.sales) - Number(saleCountsBefore.sales), 1);
      assert.equal(Number(saleCountsAfter.movements) - Number(saleCountsBefore.movements), 1);
      assert.equal(Number(saleCountsAfter.consumptions) - Number(saleCountsBefore.consumptions), 1);
      assert.equal(Number(saleCountsAfter.audits) - Number(saleCountsBefore.audits), 1);
      const saleBalance = (await setup.query("SELECT stock FROM inventory_balances WHERE business_id=$1 AND location_id=$2 AND item_id=$3", [owner.businessId, saleFixture.locationId, saleFixture.itemId])).rows[0];
      assert.equal(Number(saleBalance.stock), 2);
      await assertLayerIntegrity(setup, owner.businessId, saleFixture.itemId);

      await createInventoryEntry({ businessId: owner.businessId, userId: owner.userId, locationId: exitFixture.locationId, lines: [{ itemId: exitFixture.itemId, quantity: 5, unitCost: "3.00" }] });
      const countsBeforeConcurrentExits = await counts(setup, owner.businessId, exitFixture.itemId);
      const exitResults = await runAtBarrier(process.env.TEST_DATABASE_URL, [
        () => createInventoryExit({ businessId: owner.businessId, userId: owner.userId, locationId: exitFixture.locationId, reason: "Concurrencia", lines: [{ itemId: exitFixture.itemId, quantity: 3 }] }),
        () => createInventoryExit({ businessId: owner.businessId, userId: owner.userId, locationId: exitFixture.locationId, reason: "Concurrencia", lines: [{ itemId: exitFixture.itemId, quantity: 3 }] })
      ]);
      assert.equal(exitResults.filter((result) => result.ok && !result.value.error).length, 1);
      assert.equal(exitResults.filter((result) => result.ok && result.value.error === "insufficient_stock").length, 1);
      const exitBalance = (await setup.query("SELECT stock FROM inventory_balances WHERE business_id=$1 AND location_id=$2 AND item_id=$3", [owner.businessId, exitFixture.locationId, exitFixture.itemId])).rows[0];
      assert.equal(Number(exitBalance.stock), 2);
      const exitCounts = await counts(setup, owner.businessId, exitFixture.itemId);
      assert.equal(Number(exitCounts.movements), Number(countsBeforeConcurrentExits.movements) + 1);
      assert.equal(Number(exitCounts.consumptions), Number(countsBeforeConcurrentExits.consumptions) + 1);
      await assertLayerIntegrity(setup, owner.businessId, exitFixture.itemId);

      const transferDestination = (await setup.query(
        `INSERT INTO business_locations (business_id, name, code, location_type, status, is_default)
         VALUES ($1, 'Destino concurrencia', 'CON-DEST', 'warehouse', 'active', false) RETURNING id`,
        [owner.businessId]
      )).rows[0];
      await createInventoryEntry({ businessId: owner.businessId, userId: owner.userId, locationId: transferFixture.locationId, lines: [{ itemId: transferFixture.itemId, quantity: 5, unitCost: "4.00" }] });
      const transferResults = await runAtBarrier(process.env.TEST_DATABASE_URL, [
        () => createPosSale({ businessId: owner.businessId, userId: owner.userId, locationId: transferFixture.locationId, paymentMethod: "card", amountReceived: 0, items: [{ itemId: transferFixture.itemId, quantity: 3 }] }),
        () => createInventoryTransfer({ businessId: owner.businessId, itemId: transferFixture.itemId, userId: owner.userId, fromLocationId: transferFixture.locationId, toLocationId: Number(transferDestination.id), quantity: 3, reason: "Concurrencia", reference: "CON-TRANSFER" })
      ]);
      assert.equal(transferResults.filter((result) => result.ok && !result.value?.error).length, 1);
      assert.equal(transferResults.filter((result) => !result.ok || result.value?.error).length, 1);
      await assertLayerIntegrity(setup, owner.businessId, transferFixture.itemId);
      assert.equal((await setup.query("SELECT COUNT(*)::int AS count FROM inventory_transfers WHERE business_id=$1 AND item_id=$2", [owner.businessId, transferFixture.itemId])).rows[0].count, 1);
      const transferTotal = (await setup.query("SELECT COALESCE(SUM(stock),0) AS stock FROM inventory_balances WHERE business_id=$1 AND item_id=$2", [owner.businessId, transferFixture.itemId])).rows[0];
      assert.equal(Number(transferTotal.stock), 5);

      const productionCategory = (await setup.query("SELECT category_id FROM items WHERE id=$1", [productionFixture.itemId])).rows[0];
      const finished = (await setup.query(
        `INSERT INTO items (business_id, category_id, sku, name, description, brand, price, cost_price, stock, status)
         VALUES ($1, $2, 'CON-PROD-OUT', 'Producto producido concurrencia', 'Concurrencia', 'Pruebas', 100, 0, 0, 'active') RETURNING id`,
        [owner.businessId, productionCategory.category_id]
      )).rows[0];
      const recipe = (await setup.query(
        `INSERT INTO recipes (business_id, name, product_id, yield_quantity, yield_unit, waste_percentage, labor_cost, logistics_cost, created_by)
         VALUES ($1, 'Receta concurrencia', $2, 1, 'piece', 0, 0, 0, $3) RETURNING id`,
        [owner.businessId, finished.id, owner.userId]
      )).rows[0];
      await setup.query(
        "INSERT INTO recipe_ingredients (business_id, recipe_id, item_id, quantity, unit) VALUES ($1, $2, $3, 1, 'piece')",
        [owner.businessId, recipe.id, productionFixture.itemId]
      );
      await createInventoryEntry({ businessId: owner.businessId, userId: owner.userId, locationId: productionFixture.locationId, lines: [{ itemId: productionFixture.itemId, quantity: 1, unitCost: "5.00" }] });
      const productionResults = await runAtBarrier(process.env.TEST_DATABASE_URL, [
        () => produceRecipe({ businessId: owner.businessId, recipeId: Number(recipe.id), userId: owner.userId, locationId: productionFixture.locationId, quantity: 1 }),
        () => produceRecipe({ businessId: owner.businessId, recipeId: Number(recipe.id), userId: owner.userId, locationId: productionFixture.locationId, quantity: 1 })
      ]);
      assert.equal(productionResults.filter((result) => result.ok && !result.value.error).length, 1);
      assert.equal(productionResults.filter((result) => result.ok && result.value.error === "insufficient_stock").length, 1);
      await assertLayerIntegrity(setup, owner.businessId, productionFixture.itemId);
      assert.equal((await setup.query("SELECT stock FROM inventory_balances WHERE business_id=$1 AND location_id=$2 AND item_id=$3", [owner.businessId, productionFixture.locationId, productionFixture.itemId])).rows[0].stock, 0);

      await createInventoryEntry({ businessId: owner.businessId, userId: owner.userId, locationId: isolatedFixture.locationId, lines: [{ itemId: isolatedFixture.itemId, quantity: 2, unitCost: "6.00" }] });
      await createInventoryEntry({ businessId: foreignOwner.businessId, userId: foreignOwner.userId, locationId: foreignLocationId, lines: [{ itemId: foreignItemId, quantity: 2, unitCost: "7.00" }] });
      const isolatedResults = await runAtBarrier(process.env.TEST_DATABASE_URL, [
        () => createInventoryExit({ businessId: owner.businessId, userId: owner.userId, locationId: isolatedFixture.locationId, reason: "Negocio propio", lines: [{ itemId: isolatedFixture.itemId, quantity: 1 }] }),
        () => createInventoryExit({ businessId: foreignOwner.businessId, userId: foreignOwner.userId, locationId: foreignLocationId, reason: "Negocio ajeno", lines: [{ itemId: foreignItemId, quantity: 1 }] })
      ]);
      assert.equal(isolatedResults.filter((result) => result.ok && !result.value.error).length, 2);
      const isolatedBalances = await setup.query(
        "SELECT business_id, stock FROM inventory_balances WHERE (business_id,item_id) IN (($1,$2),($3,$4)) ORDER BY business_id",
        [owner.businessId, isolatedFixture.itemId, foreignOwner.businessId, foreignItemId]
      );
      assert.deepEqual(isolatedBalances.rows.map((row) => Number(row.stock)), [1, 1]);
      assert.equal((await setup.query("SELECT COUNT(*)::int AS count FROM inventory_cost_layers WHERE business_id=$1 AND item_id=$2", [foreignOwner.businessId, foreignItemId])).rows[0].count, 0);
    } finally {
      await applicationPool?.end().catch(() => {});
      await setup?.end().catch(() => {});
      if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = originalDatabaseUrl;
      if (databaseCreated) await dropTestDatabase().catch(() => {});
    }
  }
);
