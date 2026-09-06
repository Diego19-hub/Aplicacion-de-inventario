import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { createTestDatabase, dropTestDatabase } from "./helpers/testDatabase.js";

const { Client } = pg;
const skip = !process.env.TEST_DATABASE_URL;

async function item(client, businessId, categoryId, sku, name, price = 20) {
  return (await client.query("INSERT INTO items (business_id,category_id,sku,name,description,brand,price,cost_price,stock,status) VALUES ($1,$2,$3,$4,'Fase 3','Pruebas',$5,0,0,'active') RETURNING id", [businessId, categoryId, sku, name, price])).rows[0];
}

test("Fase 3 PEPS integra transferencias, producción, incidencias y devoluciones", { skip }, async (t) => {
  let client; let pool; let created = false;
  try {
    await createTestDatabase(); created = true;
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    client = new Client({ connectionString: process.env.TEST_DATABASE_URL }); await client.connect();
    const [{ createInventoryEntry }, { createInventoryTransfer }, { produceRecipe }, { createReturn }, { createPosSale }] = await Promise.all([
      import("../db/inventoryTransactionQueries.js"), import("../db/transferQueries.js"), import("../db/recipeQueries.js"), import("../db/inventoryReturnQueries.js"), import("../db/apiSaleQueries.js")
    ]);
    const owner = (await client.query("SELECT b.id business_id,bm.user_id FROM businesses b JOIN business_members bm ON bm.business_id=b.id WHERE b.status='active' AND bm.role='owner' AND bm.status='active' ORDER BY b.id LIMIT 1")).rows[0];
    const from = (await client.query("SELECT id FROM business_locations WHERE business_id=$1 AND status='active' ORDER BY is_default DESC,id LIMIT 1", [owner.business_id])).rows[0];
    const to = (await client.query("INSERT INTO business_locations (business_id,name,code,location_type,status,is_default) VALUES ($1,'Fase 3 destino','F3DST','warehouse','active',false) RETURNING id", [owner.business_id])).rows[0];
    const category = (await client.query("INSERT INTO categories (business_id,name,description,is_default) VALUES ($1,'Fase 3','Pruebas',false) RETURNING id", [owner.business_id])).rows[0];
    const ingredient = await item(client, owner.business_id, category.id, "F3-ING", "Ingrediente Fase 3");
    const finished = await item(client, owner.business_id, category.id, "F3-FIN", "Producto terminado Fase 3");
    await client.query("UPDATE businesses SET inventory_valuation_method='fifo' WHERE id=$1", [owner.business_id]);

    await t.test("transferencia parcial conserva capas, costo y antigüedad", async () => {
      await createInventoryEntry({ businessId: owner.business_id, userId: owner.user_id, locationId: from.id, lines: [{ itemId: ingredient.id, quantity: 3, unitCost: "2.00" }] });
      await createInventoryEntry({ businessId: owner.business_id, userId: owner.user_id, locationId: from.id, lines: [{ itemId: ingredient.id, quantity: 3, unitCost: "4.00" }] });
      const result = await createInventoryTransfer({ businessId: owner.business_id, itemId: ingredient.id, userId: owner.user_id, fromLocationId: from.id, toLocationId: to.id, quantity: 4, reason: "Reubicación Fase 3", reference: "F3-TRANSFER" });
      assert.equal(Number(result.quantity), 4);
      const layers = (await client.query("SELECT location_id,quantity_original,quantity_available,unit_cost,received_at,source_layer_id FROM inventory_cost_layers WHERE business_id=$1 AND item_id=$2 AND quantity_available>0 ORDER BY location_id,received_at,id", [owner.business_id, ingredient.id])).rows;
      assert.deepEqual(layers.map((row) => [Number(row.location_id), Number(row.quantity_available), row.unit_cost]), [[Number(from.id), 2, "4.0000"], [Number(to.id), 3, "2.0000"], [Number(to.id), 1, "4.0000"]]);
      assert.ok(layers.slice(1).every((row) => row.source_layer_id));
    });

    await t.test("transferencia completa agota las capas del origen", async () => {
      const completeItem = await item(client, owner.business_id, category.id, "F3-TRANSFER-COMPLETE", "Transferencia completa Fase 3");
      await createInventoryEntry({ businessId: owner.business_id, userId: owner.user_id, locationId: from.id, lines: [{ itemId: completeItem.id, quantity: 2, unitCost: "3.00" }] });
      await createInventoryTransfer({ businessId: owner.business_id, itemId: completeItem.id, userId: owner.user_id, fromLocationId: from.id, toLocationId: to.id, quantity: 2, reason: "Traslado completo", reference: "F3-TRANSFER-FULL" });
      assert.equal((await client.query("SELECT COALESCE(SUM(quantity_available),0)::int AS quantity FROM inventory_cost_layers WHERE business_id=$1 AND item_id=$2 AND location_id=$3", [owner.business_id, completeItem.id, from.id])).rows[0].quantity, 0);
      assert.equal((await client.query("SELECT COALESCE(SUM(quantity_available),0)::int AS quantity FROM inventory_cost_layers WHERE business_id=$1 AND item_id=$2 AND location_id=$3", [owner.business_id, completeItem.id, to.id])).rows[0].quantity, 2);
    });

    await t.test("producción consume varias capas y crea salida trazable", async () => {
      await createInventoryEntry({ businessId: owner.business_id, userId: owner.user_id, locationId: from.id, lines: [{ itemId: ingredient.id, quantity: 1, unitCost: "6.00" }] });
      const recipe = (await client.query("INSERT INTO recipes (business_id,name,product_id,yield_quantity,yield_unit,waste_percentage,labor_cost,logistics_cost,created_by) VALUES ($1,'Receta Fase 3',$2,1,'piece',0,1,1,$3) RETURNING id", [owner.business_id, finished.id, owner.user_id])).rows[0];
      await client.query("INSERT INTO recipe_ingredients (business_id,recipe_id,item_id,quantity,unit) VALUES ($1,$2,$3,1,'piece')", [owner.business_id, recipe.id, ingredient.id]);
      const result = await produceRecipe({ businessId: owner.business_id, recipeId: recipe.id, userId: owner.user_id, locationId: from.id, quantity: 3 });
      assert.ok(Math.abs(result.unitCost - (16 / 3)) < 0.000001);
      const consumed = await client.query("SELECT operation_type,quantity,unit_cost FROM inventory_layer_consumptions WHERE business_id=$1 AND operation_type='production_consumption' ORDER BY id", [owner.business_id]);
      assert.deepEqual(consumed.rows.map((row) => [row.operation_type, Number(row.quantity), row.unit_cost]), [["production_consumption", 2, "4.0000"], ["production_consumption", 1, "6.0000"]]);
      const output = await client.query("SELECT quantity_original,unit_cost,source_operation_type FROM inventory_cost_layers WHERE business_id=$1 AND item_id=$2", [owner.business_id, finished.id]);
      assert.deepEqual(output.rows[0], { quantity_original: 3, unit_cost: "5.3333", source_operation_type: "production_output" });
    });

    await t.test("daño, devolución a proveedor y stock insuficiente consumen FIFO", async () => {
      const damage = await createReturn({ businessId: owner.business_id, userId: owner.user_id, data: { returnType: "damage", locationId: to.id, reason: "Daño de transporte", items: [{ itemId: ingredient.id, quantity: 1 }] } });
      assert.equal(damage.error, undefined, `Daño no registrado: ${JSON.stringify(damage)}`);
      assert.equal(damage.return.returnType, "damage");
      const damageConsumption = await client.query("SELECT c.quantity,c.unit_cost,l.quantity_available,l.quantity_original FROM inventory_layer_consumptions c JOIN inventory_cost_layers l ON (l.business_id,l.id)=(c.business_id,c.layer_id) WHERE c.business_id=$1 AND c.operation_type='damage_loss' AND c.operation_reference=$2 ORDER BY c.id", [owner.business_id, damage.return.reference]);
      assert.equal(damageConsumption.rowCount, 1, `No existe el consumo FIFO del daño: ${JSON.stringify(damageConsumption.rows)}`);
      assert.deepEqual(damageConsumption.rows[0], { quantity: 1, unit_cost: "2.0000", quantity_available: 2, quantity_original: 3 });
      const supplier = (await client.query("INSERT INTO suppliers (business_id,name,status) VALUES ($1,'Proveedor Fase 3','active') RETURNING id", [owner.business_id])).rows[0];
      const order = (await client.query("INSERT INTO purchase_orders (business_id,supplier_id,location_id,status,created_by) VALUES ($1,$2,$3,'received',$4) RETURNING id", [owner.business_id, supplier.id, to.id, owner.user_id])).rows[0];
      const orderItem = (await client.query("INSERT INTO purchase_order_items (business_id,purchase_order_id,item_id,quantity_ordered,quantity_received,unit_cost) VALUES ($1,$2,$3,1,1,4) RETURNING id", [owner.business_id, order.id, ingredient.id])).rows[0];
      const supplierReturn = await createReturn({ businessId: owner.business_id, userId: owner.user_id, data: { returnType: "supplier_return", purchaseOrderId: order.id, locationId: to.id, reason: "Devolución proveedor", items: [{ itemId: ingredient.id, quantity: 1 }] } });
      assert.equal(supplierReturn.error, undefined, `Devolución no registrada: ${JSON.stringify(supplierReturn)}`);
      // La devolución consume la siguiente capa disponible en destino (2.00),
      // aunque la orden histórica se haya capturado a 4.00.
      const supplierLine = supplierReturn.items?.[0];
      assert.ok(supplierLine, `La devolución no devolvió líneas: ${JSON.stringify(supplierReturn)}`);
      const storedSupplierLine = await client.query("SELECT quantity,unit_cost FROM inventory_return_items WHERE business_id=$1 AND return_id=$2", [owner.business_id, supplierReturn.return.id]);
      assert.equal(storedSupplierLine.rowCount, 1, `No existe la línea persistida: ${JSON.stringify(storedSupplierLine.rows)}`);
      assert.deepEqual(storedSupplierLine.rows[0], { quantity: 1, unit_cost: "2.0000" });
      const supplierConsumption = await client.query("SELECT c.quantity,c.unit_cost,l.quantity_available,l.quantity_original FROM inventory_layer_consumptions c JOIN inventory_cost_layers l ON (l.business_id,l.id)=(c.business_id,c.layer_id) WHERE c.business_id=$1 AND c.operation_type='supplier_return' AND c.operation_reference=$2 ORDER BY c.id", [owner.business_id, supplierReturn.return.reference]);
      assert.equal(supplierConsumption.rowCount, 1, `No existe el consumo FIFO: ${JSON.stringify(supplierConsumption.rows)}`);
      assert.deepEqual(supplierConsumption.rows[0], { quantity: 1, unit_cost: "2.0000", quantity_available: 1, quantity_original: 3 });
      assert.equal(supplierLine.unitCost, 2);
      assert.equal((await client.query("SELECT quantity_returned FROM purchase_order_items WHERE id=$1", [orderItem.id])).rows[0].quantity_returned, 1);
      const loss = await createReturn({ businessId: owner.business_id, userId: owner.user_id, data: { returnType: "loss", locationId: to.id, reason: "Pérdida registrada", items: [{ itemId: ingredient.id, quantity: 1 }] } });
      assert.equal(loss.items[0].unitCost, 2);
      const beforeRollback = await client.query("SELECT (SELECT count(*) FROM inventory_returns WHERE business_id=$1) AS returns, (SELECT count(*) FROM inventory_layer_consumptions WHERE business_id=$1) AS consumptions", [owner.business_id]);
      const rolledBack = await createReturn({ businessId: owner.business_id, userId: owner.user_id, data: { returnType: "loss", locationId: to.id, reason: "Prueba de rollback", items: [{ itemId: ingredient.id, quantity: 1 }, { itemId: 999999, quantity: 1 }] } });
      assert.equal(rolledBack.error, "product_not_found");
      const afterRollback = await client.query("SELECT (SELECT count(*) FROM inventory_returns WHERE business_id=$1) AS returns, (SELECT count(*) FROM inventory_layer_consumptions WHERE business_id=$1) AS consumptions", [owner.business_id]);
      assert.deepEqual(afterRollback.rows[0], beforeRollback.rows[0]);
      const insufficient = await createReturn({ businessId: owner.business_id, userId: owner.user_id, data: { returnType: "loss", locationId: to.id, reason: "Pérdida excesiva", items: [{ itemId: ingredient.id, quantity: 99 }] } });
      assert.equal(insufficient.error, "insufficient_stock");
    });

    await t.test("devolución de cliente parcial, repetida y dañada conserva trazabilidad", async () => {
      // La venta de un producto con receta también consume sus ingredientes;
      // se agregan dos unidades disponibles para las dos ventas del fixture.
      await createInventoryEntry({ businessId: owner.business_id, userId: owner.user_id, locationId: from.id, lines: [{ itemId: ingredient.id, quantity: 2, unitCost: "6.00" }] });
      const finishedState = (await client.query("SELECT b.stock,COALESCE(SUM(l.quantity_available),0)::int AS layer_stock FROM inventory_balances b JOIN inventory_cost_layers l ON (l.business_id,l.item_id,l.location_id)=(b.business_id,b.item_id,b.location_id) WHERE b.business_id=$1 AND b.item_id=$2 AND b.location_id=$3 AND l.status='available' GROUP BY b.stock", [owner.business_id, finished.id, from.id])).rows[0];
      assert.ok(finishedState && Number(finishedState.stock) >= 2 && Number(finishedState.layer_stock) >= 2, `El fixture de venta requiere stock FIFO disponible: ${JSON.stringify(finishedState)}`);
      const ingredientState = (await client.query("SELECT stock FROM inventory_balances WHERE business_id=$1 AND item_id=$2 AND location_id=$3", [owner.business_id, ingredient.id, from.id])).rows[0];
      assert.ok(ingredientState && Number(ingredientState.stock) >= 2, `La receta requiere ingredientes disponibles: ${JSON.stringify(ingredientState)}`);
      const sale = await createPosSale({ businessId: owner.business_id, userId: owner.user_id, locationId: from.id, paymentMethod: "card", amountReceived: 0, items: [{ itemId: finished.id, quantity: 1 }] });
      const saleItem = (await client.query("SELECT id FROM sale_items WHERE business_id=$1 AND sale_id=$2", [owner.business_id, sale.sale.id])).rows[0];
      const returned = await createReturn({ businessId: owner.business_id, userId: owner.user_id, data: { returnType: "customer_return", saleId: sale.sale.id, locationId: from.id, reason: "Cliente devuelve", items: [{ itemId: finished.id, saleItemId: saleItem.id, quantity: 1, condition: "good" }] } });
      assert.equal(returned.return.saleId, Number(sale.sale.id));
      const repeated = await createReturn({ businessId: owner.business_id, userId: owner.user_id, data: { returnType: "customer_return", saleId: sale.sale.id, locationId: from.id, reason: "Cliente devuelve otra vez", items: [{ itemId: finished.id, saleItemId: saleItem.id, quantity: 1, condition: "damaged" }] } });
      assert.equal(repeated.error, "return_exceeds_sold");
      const secondSale = await createPosSale({ businessId: owner.business_id, userId: owner.user_id, locationId: from.id, paymentMethod: "card", amountReceived: 0, items: [{ itemId: finished.id, quantity: 1 }] });
      const secondSaleItem = (await client.query("SELECT id FROM sale_items WHERE business_id=$1 AND sale_id=$2", [owner.business_id, secondSale.sale.id])).rows[0];
      const stockBeforeDamaged = (await client.query("SELECT stock FROM inventory_balances WHERE business_id=$1 AND location_id=$2 AND item_id=$3", [owner.business_id, from.id, finished.id])).rows[0].stock;
      const damaged = await createReturn({ businessId: owner.business_id, userId: owner.user_id, data: { returnType: "customer_return", saleId: secondSale.sale.id, locationId: from.id, reason: "Cliente devuelve dañado", items: [{ itemId: finished.id, saleItemId: secondSaleItem.id, quantity: 1, condition: "damaged" }] } });
      assert.equal(damaged.items[0].condition, "damaged");
      assert.equal((await client.query("SELECT stock FROM inventory_balances WHERE business_id=$1 AND location_id=$2 AND item_id=$3", [owner.business_id, from.id, finished.id])).rows[0].stock, stockBeforeDamaged);
    });

    await t.test("average no crea capas FIFO", async () => {
      await client.query("UPDATE businesses SET inventory_valuation_method='average' WHERE id=$1", [owner.business_id]);
      const average = await item(client, owner.business_id, category.id, "F3-AVG", "Average Fase 3");
      await createInventoryEntry({ businessId: owner.business_id, userId: owner.user_id, locationId: from.id, lines: [{ itemId: average.id, quantity: 1, unitCost: 8 }] });
      assert.equal((await client.query("SELECT count(*)::int count FROM inventory_cost_layers WHERE business_id=$1 AND item_id=$2", [owner.business_id, average.id])).rows[0].count, 0);
    });
  } finally {
    if (client) await client.end(); if (pool) await pool.end();
    if (created) await dropTestDatabase();
  }
});
