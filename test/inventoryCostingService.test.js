import test from "node:test";
import assert from "node:assert/strict";

import {
  InventoryCostingError,
  consumeCostLayers,
  lockAvailableCostLayers
} from "../services/inventoryCostingService.js";

test("bloquea primero el producto y después las capas disponibles con FOR UPDATE", async () => {
  const queries = [];
  const client = {
    async query(sql, values) {
      queries.push({ sql, values });
      if (sql.includes("FROM items")) return { rows: [{ id: 12 }] };
      return { rows: [] };
    }
  };

  const layers = await lockAvailableCostLayers(client, { businessId: 4, itemId: 12, locationId: 8 });

  assert.deepEqual(layers, []);
  assert.equal(queries.length, 2);
  assert.match(queries[0].sql, /FROM items/);
  assert.match(queries[0].sql, /ORDER BY id\s+FOR UPDATE/);
  assert.match(queries[1].sql, /quantity_available > 0/);
  assert.match(queries[1].sql, /ORDER BY received_at, id\s+FOR UPDATE/);
  assert.equal(queries.some(({ sql }) => /\b(BEGIN|COMMIT|ROLLBACK)\b/.test(sql)), false);
});

test("rechaza consumo insuficiente antes de actualizar o registrar consumos", async () => {
  const queries = [];
  const client = {
    async query(sql) {
      queries.push(sql);
      if (sql.includes("FROM items")) return { rows: [{ id: 12 }] };
      if (sql.includes("FROM business_locations")) return { rows: [{ id: 8 }] };
      if (sql.includes("FROM inventory_cost_layers")) {
        return { rows: [{ id: 5, quantity_available: 2, unit_cost: "3.50" }] };
      }
      throw new Error("No debe intentar actualizar una capa ni registrar un consumo.");
    }
  };

  await assert.rejects(
    consumeCostLayers(client, {
      businessId: 4,
      itemId: 12,
      locationId: 8,
      quantity: 3,
      operationType: "other",
      operationId: 1
    }),
    (error) => error instanceof InventoryCostingError && error.code === "INSUFFICIENT_COST_LAYER_STOCK"
  );
  assert.equal(queries.length, 3);
  assert.equal(queries.some((sql) => /UPDATE inventory_cost_layers|INSERT INTO inventory_layer_consumptions/.test(sql)), false);
});
