import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";

import { createTestDatabase, dropTestDatabase, withTestTransaction } from "./helpers/testDatabase.js";

const { Client } = pg;
const skip = !process.env.TEST_DATABASE_URL;
const originalDatabaseUrl = process.env.DATABASE_URL;

async function addItem(client, businessId, suffix, isDefault = false) {
  const category = (await client.query(
    "INSERT INTO categories (business_id,name,description,is_default) VALUES ($1,$2,'FIFO fase 2',$3) RETURNING id",
    [businessId, `FIFO ${suffix}`, isDefault]
  )).rows[0];
  return (await client.query(
    `INSERT INTO items (business_id,category_id,sku,name,description,brand,price,stock,status)
     VALUES ($1,$2,$3,$4,'FIFO fase 2','Pruebas',10,0,'active') RETURNING id`,
    [businessId, category.id, `FIFO-${suffix}`, `Producto FIFO ${suffix}`]
  )).rows[0];
}

test("Fase 2 PEPS integra entradas, compras, salidas, ajustes y ventas", { skip }, async (t) => {
  let client;
  let pool;
  let created = false;

  try {
    await createTestDatabase();
    created = true;
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    client = new Client({ connectionString: process.env.TEST_DATABASE_URL });
    await client.connect();
    const { createInventoryEntry, createInventoryAdjustment, createInventoryExit } = await import("../db/inventoryTransactionQueries.js");
    const { receivePurchase } = await import("../db/purchaseQueries.js");
    const { createPosSale, SaleDomainError } = await import("../db/apiSaleQueries.js");
    const { default: importedPool } = await import("../db/pool.js");
    pool = importedPool;

    const owner = (await client.query(
      `SELECT b.id AS business_id, bm.user_id
       FROM businesses b JOIN business_members bm ON bm.business_id=b.id
       WHERE b.status='active' AND bm.role='owner' AND bm.status='active' ORDER BY b.id LIMIT 1`
    )).rows[0];
    const location = (await client.query(
      "SELECT id FROM business_locations WHERE business_id=$1 AND is_default AND status='active'",
      [owner.business_id]
    )).rows[0];
    await client.query("UPDATE businesses SET inventory_valuation_method='fifo' WHERE id=$1", [owner.business_id]);
    const item = await addItem(client, owner.business_id, "OPERACIONES");

    await t.test("entrada manual con costo crea capa", async () => {
      await createInventoryEntry({
        businessId: owner.business_id, userId: owner.user_id, locationId: location.id,
        lines: [{ itemId: item.id, quantity: 10, unitCost: 2 }]
      });
      const layer = await client.query(
        "SELECT quantity_original,quantity_available,unit_cost,source_operation_type FROM inventory_cost_layers WHERE business_id=$1 AND item_id=$2",
        [owner.business_id, item.id]
      );
      assert.deepEqual(layer.rows[0], { quantity_original: 10, quantity_available: 10, unit_cost: "2.0000", source_operation_type: "manual_entry" });
    });

    await t.test("ajuste positivo FIFO exige costo y audita costo cero autorizado", async () => {
      const ruleItem = await addItem(client, owner.business_id, "AJUSTE-COSTO");
      const { calculateInventoryValue } = await import("../services/inventoryCostingService.js");
      const missingCost = await createInventoryAdjustment({
        businessId: owner.business_id, userId: owner.user_id, locationId: location.id,
        notes: "Ajuste sin costo", lines: [{ itemId: ruleItem.id, quantity: 2, adjustmentType: "increase" }]
      });
      assert.equal(missingCost.error, "fifo_adjustment_cost_required");
      const unauthorizedZero = await createInventoryAdjustment({
        businessId: owner.business_id, userId: owner.user_id, locationId: location.id,
        notes: "Ajuste costo cero", lines: [{ itemId: ruleItem.id, quantity: 2, adjustmentType: "increase", unitCost: 0 }]
      });
      assert.equal(unauthorizedZero.error, "fifo_zero_cost_reason_required");
      const failedState = await client.query("SELECT count(*)::int AS layers FROM inventory_cost_layers WHERE business_id=$1 AND item_id=$2", [owner.business_id, ruleItem.id]);
      assert.equal(failedState.rows[0].layers, 0);
      const authorizedZero = await createInventoryAdjustment({
        businessId: owner.business_id, userId: owner.user_id, locationId: location.id,
        reference: "ADJUST-ZERO-AUTHORIZED", notes: "Existencia sin costo conocido", lines: [{ itemId: ruleItem.id, quantity: 2, adjustmentType: "increase", unitCost: 0, zeroCostReason: "no_cost_known" }]
      });
      assert.equal(authorizedZero.warnings.length, 1);
      const paid = await createInventoryAdjustment({
        businessId: owner.business_id, userId: owner.user_id, locationId: location.id,
        reference: "ADJUST-COSTED", notes: "Ajuste con costo", lines: [{ itemId: ruleItem.id, quantity: 3, adjustmentType: "increase", unitCost: "5.25" }]
      });
      assert.equal(paid.warnings, undefined);
      const layers = await client.query("SELECT quantity_original,unit_cost FROM inventory_cost_layers WHERE business_id=$1 AND item_id=$2 ORDER BY id", [owner.business_id, ruleItem.id]);
      assert.deepEqual(layers.rows, [{ quantity_original: 2, unit_cost: "0.0000" }, { quantity_original: 3, unit_cost: "5.2500" }]);
      const value = await calculateInventoryValue(client, { businessId: owner.business_id, itemId: ruleItem.id, locationId: location.id });
      assert.equal(value.inventory_value, "15.7500");
      const audit = await client.query("SELECT description,new_values->'lines' AS lines FROM audit_log WHERE business_id=$1 AND reference='ADJUST-ZERO-AUTHORIZED'", [owner.business_id]);
      assert.match(audit.rows[0].description, /costo cero autorizado/i);
      assert.equal(audit.rows[0].lines[0].zeroCostReason, "no_cost_known");
    });

    await t.test("ajustes positivo y negativo y salida consumen FIFO", async () => {
      await createInventoryAdjustment({
        businessId: owner.business_id, userId: owner.user_id, locationId: location.id,
        notes: "Ajuste positivo FIFO", lines: [{ itemId: item.id, quantity: 5, adjustmentType: "increase", unitCost: 0, zeroCostReason: "no_cost_known" }]
      });
      await createInventoryAdjustment({
        businessId: owner.business_id, userId: owner.user_id, locationId: location.id,
        notes: "Ajuste negativo FIFO", lines: [{ itemId: item.id, quantity: 3, adjustmentType: "decrease" }]
      });
      await createInventoryExit({
        businessId: owner.business_id, userId: owner.user_id, locationId: location.id,
        reason: "Salida FIFO", lines: [{ itemId: item.id, quantity: 2 }]
      });
      const layers = await client.query(
        "SELECT quantity_available FROM inventory_cost_layers WHERE business_id=$1 AND item_id=$2 ORDER BY received_at,id",
        [owner.business_id, item.id]
      );
      assert.deepEqual(layers.rows.map((row) => Number(row.quantity_available)), [5, 5]);
      const consumed = await client.query(
        "SELECT count(*)::int AS count FROM inventory_layer_consumptions WHERE business_id=$1 AND operation_type IN ('adjustment_out','manual_exit')",
        [owner.business_id]
      );
      assert.equal(consumed.rows[0].count, 2);
    });

    await t.test("recepción de compra crea capa al costo de la orden", async () => {
      const supplier = (await client.query(
        "INSERT INTO suppliers (business_id,name,status) VALUES ($1,'Proveedor FIFO','active') RETURNING id",
        [owner.business_id]
      )).rows[0];
      const order = (await client.query(
        "INSERT INTO purchase_orders (business_id,supplier_id,location_id,status,created_by) VALUES ($1,$2,$3,'pending',$4) RETURNING id",
        [owner.business_id, supplier.id, location.id, owner.user_id]
      )).rows[0];
      await client.query(
        "INSERT INTO purchase_order_items (business_id,purchase_order_id,item_id,quantity_ordered,unit_cost) VALUES ($1,$2,$3,4,4)",
        [owner.business_id, order.id, item.id]
      );
      await receivePurchase({ businessId: owner.business_id, userId: owner.user_id, purchaseId: order.id, items: [{ itemId: item.id, quantity: 4 }] });
      const latest = await client.query(
        "SELECT quantity_available,unit_cost,source_operation_type FROM inventory_cost_layers WHERE business_id=$1 AND item_id=$2 ORDER BY id DESC LIMIT 1",
        [owner.business_id, item.id]
      );
      assert.deepEqual(latest.rows[0], { quantity_available: 4, unit_cost: "4.0000", source_operation_type: "purchase_receipt" });
    });

    const preSaleLayers = await client.query(
      `SELECT quantity_original, quantity_available, unit_cost, received_at, source_operation_type,
              source_operation_id, source_reference, business_id, item_id, location_id
       FROM inventory_cost_layers
       WHERE business_id=$1 AND item_id=$2 AND location_id=$3
       ORDER BY received_at,id`,
      [owner.business_id, item.id, location.id]
    );
    assert.equal(preSaleLayers.rowCount, 3);
    assert.deepEqual(preSaleLayers.rows.map((layer) => ({
      original: Number(layer.quantity_original), available: Number(layer.quantity_available),
      cost: layer.unit_cost, source: layer.source_operation_type,
      businessId: Number(layer.business_id), itemId: Number(layer.item_id), locationId: Number(layer.location_id)
    })), [
      { original: 10, available: 5, cost: "2.0000", source: "manual_entry", businessId: Number(owner.business_id), itemId: Number(item.id), locationId: Number(location.id) },
      { original: 5, available: 5, cost: "0.0000", source: "adjustment_in", businessId: Number(owner.business_id), itemId: Number(item.id), locationId: Number(location.id) },
      { original: 4, available: 4, cost: "4.0000", source: "purchase_receipt", businessId: Number(owner.business_id), itemId: Number(item.id), locationId: Number(location.id) }
    ]);
    assert.ok(preSaleLayers.rows.every((layer) => Number(layer.source_operation_id) > 0 && typeof layer.source_reference === "string" && layer.source_reference.length > 0));
    assert.ok(new Date(preSaleLayers.rows[0].received_at) <= new Date(preSaleLayers.rows[1].received_at));
    assert.ok(new Date(preSaleLayers.rows[1].received_at) <= new Date(preSaleLayers.rows[2].received_at));

    await t.test("venta parcial usa varias capas FIFO y guarda costo/utilidad real", async () => {
      const sale = await createPosSale({
        businessId: owner.business_id, userId: owner.user_id, locationId: location.id,
        paymentMethod: "card", amountReceived: 0, items: [{ itemId: item.id, quantity: 11 }]
      });
      const consumptions = await client.query(
        `SELECT c.quantity,c.unit_cost,c.operation_type,c.operation_id,c.related_movement_id,l.received_at,l.id AS layer_id
         FROM inventory_layer_consumptions c
         JOIN inventory_cost_layers l ON (l.business_id,l.id)=(c.business_id,c.layer_id)
         WHERE c.business_id=$1 AND c.operation_type='sale' AND c.operation_id=$2
         ORDER BY l.received_at,l.id,c.id`,
        [owner.business_id, sale.sale.id]
      );
      assert.deepEqual(consumptions.rows.map((row) => [Number(row.quantity), row.unit_cost]), [[5, "2.0000"], [5, "0.0000"], [1, "4.0000"]]);
      assert.ok(new Date(consumptions.rows[0].received_at) <= new Date(consumptions.rows[1].received_at));
      assert.ok(new Date(consumptions.rows[1].received_at) <= new Date(consumptions.rows[2].received_at));
      const line = await client.query(
        `SELECT unit_cost,unit_cost_snapshot,inventory_cost_snapshot,gross_profit_snapshot,valuation_method_snapshot
         FROM sale_items WHERE business_id=$1 AND sale_id=$2`,
        [owner.business_id, sale.sale.id]
      );
      assert.deepEqual(line.rows[0], {
        unit_cost: "1.27", unit_cost_snapshot: "1.2727272727", inventory_cost_snapshot: "14.0000",
        gross_profit_snapshot: "96.0000", valuation_method_snapshot: "fifo"
      });
      const header = await client.query("SELECT inventory_cost_snapshot,gross_profit_snapshot,valuation_method_snapshot FROM sales WHERE business_id=$1 AND id=$2", [owner.business_id, sale.sale.id]);
      assert.deepEqual(header.rows[0], { inventory_cost_snapshot: "14.0000", gross_profit_snapshot: "96.0000", valuation_method_snapshot: "fifo" });
    });

    await t.test("inventario insuficiente revierte la venta y sus consumos", async () => {
      const before = await client.query("SELECT count(*)::int AS sales FROM sales WHERE business_id=$1", [owner.business_id]);
      await assert.rejects(
        createPosSale({ businessId: owner.business_id, userId: owner.user_id, locationId: location.id, paymentMethod: "card", amountReceived: 0, items: [{ itemId: item.id, quantity: 999 }] }),
        (error) => error instanceof SaleDomainError && error.code === "POS_INSUFFICIENT_STOCK"
      );
      const after = await client.query("SELECT count(*)::int AS sales FROM sales WHERE business_id=$1", [owner.business_id]);
      assert.equal(after.rows[0].sales, before.rows[0].sales);
    });

    await t.test("average conserva el flujo sin capas y el negocio queda aislado", async () => {
      const averageItem = await addItem(client, owner.business_id, "AVERAGE");
      await client.query("UPDATE businesses SET inventory_valuation_method='average' WHERE id=$1", [owner.business_id]);
      await createInventoryEntry({ businessId: owner.business_id, userId: owner.user_id, locationId: location.id, lines: [{ itemId: averageItem.id, quantity: 2, unitCost: 7 }] });
      const averageAdjustment = await createInventoryAdjustment({ businessId: owner.business_id, userId: owner.user_id, locationId: location.id, notes: "Ajuste average sin costo", lines: [{ itemId: averageItem.id, quantity: 1, adjustmentType: "increase" }] });
      assert.equal(averageAdjustment.error, undefined);
      const layers = await client.query("SELECT count(*)::int AS count FROM inventory_cost_layers WHERE business_id=$1 AND item_id=$2", [owner.business_id, averageItem.id]);
      assert.equal(layers.rows[0].count, 0);
      await client.query("UPDATE businesses SET inventory_valuation_method='fifo' WHERE id=$1", [owner.business_id]);

      const { foreignBusiness, foreignItem } = await withTestTransaction(client, async () => {
        const foreignUser = (await client.query("INSERT INTO users(username,email,password_hash,platform_role) VALUES('fifo_phase2_foreign','fifo-phase2-foreign@example.test','hash','user') RETURNING id")).rows[0];
        const foreignBusiness = (await client.query("INSERT INTO businesses(name,slug,created_by,status) VALUES('FIFO fase 2 ajeno','fifo-fase-2-ajeno',$1,'active') RETURNING id", [foreignUser.id])).rows[0];
        await client.query("INSERT INTO business_members(business_id,user_id,role,status) VALUES($1,$2,'owner','active')", [foreignBusiness.id, foreignUser.id]);
        const foreignItem = await addItem(client, foreignBusiness.id, "AJENO", true);
        return { foreignBusiness, foreignItem };
      });
      const foreignAttempt = await createInventoryEntry({
        businessId: owner.business_id, userId: owner.user_id, locationId: location.id,
        lines: [{ itemId: foreignItem.id, quantity: 1, unitCost: 1 }]
      });
      assert.equal(foreignAttempt.error, "product_not_found");
    });
  } finally {
    if (client) await client.end();
    if (pool) await pool.end();
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
    if (created) await dropTestDatabase();
  }
});
