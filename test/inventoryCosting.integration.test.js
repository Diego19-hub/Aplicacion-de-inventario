import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import pg from "pg";

import { createTestDatabase, dropTestDatabase, withTestTransaction } from "./helpers/testDatabase.js";
import {
  InventoryCostingError,
  calculateAvailableCost,
  calculateInventoryValue,
  consumeCostLayers,
  createCostLayer,
  getAvailableCostLayers,
  getInventoryValuationMethod,
  lockAvailableCostLayers,
  restoreCostLayerStock
} from "../services/inventoryCostingService.js";

const { Client } = pg;
const available = Boolean(process.env.TEST_DATABASE_URL);

async function createForeignBusiness(client) {
  await client.query("BEGIN");
  try {
    const user = (await client.query(
      "INSERT INTO users(username,email,password_hash,platform_role) VALUES('fifo_foreign','fifo-foreign@example.test','hash','user') RETURNING id"
    )).rows[0];
    const business = (await client.query(
      "INSERT INTO businesses(name,slug,created_by,status) VALUES('Negocio FIFO ajeno','negocio-fifo-ajeno',$1,'active') RETURNING id",
      [user.id]
    )).rows[0];
    await client.query(
      "INSERT INTO business_members(business_id,user_id,role,status) VALUES($1,$2,'owner','active')",
      [business.id, user.id]
    );
    const category = (await client.query(
      "INSERT INTO categories(business_id,name,description,is_default) VALUES($1,'General','Categoría predeterminada',true) RETURNING id",
      [business.id]
    )).rows[0];
    const location = (await client.query(
      "INSERT INTO business_locations(business_id,name,code,location_type,status,is_default) VALUES($1,'Ubicación FIFO ajena','FIFO-AJENA','warehouse','active',true) RETURNING id",
      [business.id]
    )).rows[0];
    const item = (await client.query(
      "INSERT INTO items(sku,name,description,brand,price,stock,category_id,business_id,status) VALUES('FIFO-FOREIGN','Producto FIFO ajeno','Descripción','Marca',10,0,$1,$2,'active') RETURNING id",
      [category.id, business.id]
    )).rows[0];
    await client.query("COMMIT");
    return { businessId: Number(business.id), itemId: Number(item.id), locationId: Number(location.id) };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

test("capas FIFO: migración, aislamiento, consumo, bloqueo y rollback", { skip: !available }, async (t) => {
  let client;
  let created = false;

  try {
    await createTestDatabase();
    created = true;
    client = new Client({ connectionString: process.env.TEST_DATABASE_URL });
    await client.connect();

    const owner = (await client.query(`
      SELECT u.id, b.id AS business_id
      FROM users u
      INNER JOIN business_members bm ON bm.user_id = u.id
      INNER JOIN businesses b ON b.id = bm.business_id
      WHERE u.platform_role = 'super_admin'
        AND bm.role = 'owner'
        AND bm.status = 'active'
      ORDER BY b.id
      LIMIT 1
    `)).rows[0];
    const category = (await client.query(
      "INSERT INTO categories(business_id,name,description) VALUES($1,'FIFO','Pruebas FIFO') RETURNING id",
      [owner.business_id]
    )).rows[0];
    const location = (await client.query(
      "SELECT id FROM business_locations WHERE business_id=$1 AND is_default AND status='active'",
      [owner.business_id]
    )).rows[0];
    const item = (await client.query(
      "INSERT INTO items(sku,name,description,brand,price,stock,category_id,business_id,status) VALUES('FIFO-001','Producto FIFO','Descripción','Marca',10,0,$1,$2,'active') RETURNING id",
      [category.id, owner.business_id]
    )).rows[0];
    const foreign = await createForeignBusiness(client);
    const context = {
      businessId: Number(owner.business_id),
      itemId: Number(item.id),
      locationId: Number(location.id),
      createdBy: Number(owner.id)
    };

    await t.test("average es el método predeterminado y crea una capa con las FKs del negocio", async () => {
      assert.equal(await getInventoryValuationMethod(client, { businessId: context.businessId }), "average");
      const layer = await withTestTransaction(client, () => createCostLayer(client, {
        ...context,
        quantity: 10,
        unitCost: "3.2500",
        sourceOperationType: "manual_entry",
        sourceOperationId: 1,
        sourceReference: "FIFO-ENTRY-1",
        receivedAt: "2026-01-01T09:00:00Z"
      }));
      assert.equal(Number(layer.quantity_original), 10);
      assert.equal(Number(layer.quantity_available), 10);
      assert.equal(layer.status, "available");
    });

    await t.test("consume parcialmente una capa y calcula su costo disponible", async () => {
      const consumptions = await withTestTransaction(client, () => consumeCostLayers(client, {
        ...context,
        quantity: 4,
        operationType: "other",
        operationId: 10,
        operationReference: "FIFO-CONSUME-1"
      }));
      assert.equal(consumptions.length, 1);
      assert.equal(Number(consumptions[0].consumption.quantity), 4);
      assert.equal(Number(consumptions[0].consumption.quantity) * Number(consumptions[0].consumption.unit_cost), 13);
      assert.equal(Number((await calculateAvailableCost(client, context)).inventory_value), 19.5);
    });

    await t.test("consume varias capas en orden FIFO", async () => {
      await withTestTransaction(client, () => createCostLayer(client, {
        ...context,
        quantity: 8,
        unitCost: "4.0000",
        sourceOperationType: "manual_entry",
        sourceOperationId: 2,
        sourceReference: "FIFO-ENTRY-2",
        receivedAt: "2026-01-02T09:00:00Z"
      }));
      const consumptions = await withTestTransaction(client, () => consumeCostLayers(client, {
        ...context,
        quantity: 8,
        operationType: "other",
        operationId: 11,
        operationReference: "FIFO-CONSUME-2"
      }));
      assert.deepEqual(consumptions.map(({ layer, consumption }) => [Number(layer.id), Number(consumption.quantity)]), [
        [Number(consumptions[0].layer.id), 6],
        [Number(consumptions[1].layer.id), 2]
      ]);
      assert.ok(new Date(consumptions[0].layer.received_at) < new Date(consumptions[1].layer.received_at));
      const layers = await getAvailableCostLayers(client, context);
      assert.deepEqual(layers.map((layer) => Number(layer.quantity_available)), [6]);
    });

    await t.test("impide el consumo insuficiente sin dejar cambios", async () => {
      const before = await calculateAvailableCost(client, context);
      await client.query("BEGIN");
      try {
        await assert.rejects(
          consumeCostLayers(client, {
            ...context,
            quantity: 7,
            operationType: "other",
            operationId: 12
          }),
          (error) => error instanceof InventoryCostingError && error.code === "INSUFFICIENT_COST_LAYER_STOCK"
        );
      } finally {
        await client.query("ROLLBACK");
      }
      const after = await calculateAvailableCost(client, context);
      assert.deepEqual(after, before);
    });

    await t.test("restaura existencias a una capa sin exceder su cantidad original", async () => {
      const depleted = (await client.query(
        "SELECT id FROM inventory_cost_layers WHERE business_id=$1 AND item_id=$2 AND quantity_available=0 ORDER BY id LIMIT 1",
        [context.businessId, context.itemId]
      )).rows[0];
      const restored = await withTestTransaction(client, () => restoreCostLayerStock(client, {
        businessId: context.businessId,
        itemId: context.itemId,
        layerId: Number(depleted.id),
        quantity: 2
      }));
      assert.equal(Number(restored.quantity_available), 2);
      assert.equal(restored.status, "available");
    });

    await t.test("no permite acceder a productos o capas de otro negocio", async () => {
      await assert.rejects(
        withTestTransaction(client, () => createCostLayer(client, {
          businessId: context.businessId,
          itemId: foreign.itemId,
          locationId: context.locationId,
          quantity: 1,
          unitCost: 1,
          sourceOperationType: "manual_entry",
          sourceOperationId: 20
        })),
        (error) => error instanceof InventoryCostingError && error.code === "ITEM_NOT_FOUND"
      );
      assert.deepEqual(await getAvailableCostLayers(client, {
        businessId: foreign.businessId,
        itemId: context.itemId,
        locationId: context.locationId
      }), []);
    });

    await t.test("propaga errores para que el llamador haga rollback", async () => {
      await client.query("BEGIN");
      try {
        await createCostLayer(client, {
          ...context,
          quantity: 1,
          unitCost: 9,
          sourceOperationType: "manual_entry",
          sourceOperationId: 30,
          sourceReference: "FIFO-ROLLBACK"
        });
        throw new Error("falla posterior simulada");
      } catch (error) {
        await client.query("ROLLBACK");
      }
      const rolledBack = await client.query(
        "SELECT COUNT(*)::INTEGER AS count FROM inventory_cost_layers WHERE business_id=$1 AND source_reference='FIFO-ROLLBACK'",
        [context.businessId]
      );
      assert.equal(rolledBack.rows[0].count, 0);
    });

    await t.test("la consulta de bloqueo usa FOR UPDATE y el valor total se limita al negocio", async () => {
      const statements = [];
      const trackingClient = {
        query: async (...argumentsList) => {
          statements.push(String(argumentsList[0]));
          return client.query(...argumentsList);
        }
      };
      await client.query("BEGIN");
      try {
        await lockAvailableCostLayers(trackingClient, context);
      } finally {
        await client.query("ROLLBACK");
      }
      assert.ok(statements.some((statement) => /inventory_cost_layers[\s\S]*FOR UPDATE/.test(statement)));
      const value = await calculateInventoryValue(client, { businessId: context.businessId });
      assert.equal(Number(value.inventory_value), 30.5);
    });

    await t.test("la migración 030 revierte sin tocar movimientos históricos", async () => {
      await client.query("DELETE FROM inventory_layer_consumptions");
      await client.query("DELETE FROM inventory_cost_layers");
      const beforeMovements = await client.query("SELECT COUNT(*)::INTEGER AS count FROM inventory_movements");
      const downSql = await readFile(new URL("../db/migrations/030_fifo_inventory_valuation_down.sql", import.meta.url), "utf8");
      await client.query(downSql);
      assert.equal((await client.query("SELECT to_regclass('public.inventory_cost_layers') AS relation")).rows[0].relation, null);
      assert.equal((await client.query("SELECT to_regclass('public.inventory_layer_consumptions') AS relation")).rows[0].relation, null);
      const afterMovements = await client.query("SELECT COUNT(*)::INTEGER AS count FROM inventory_movements");
      assert.deepEqual(afterMovements.rows[0], beforeMovements.rows[0]);
    });
  } finally {
    if (client) await client.end();
    if (created) await dropTestDatabase();
  }
});
