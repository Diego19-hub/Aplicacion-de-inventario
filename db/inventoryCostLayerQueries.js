function assertClient(client) { if (!client || typeof client.query !== "function") throw new TypeError("Se requiere un cliente PostgreSQL transaccional."); }

export async function lockInventoryItemsForUpdate(client, { businessId, itemIds }) {
  assertClient(client);
  const ids = [...new Set(itemIds)].sort((a, b) => a - b);
  const result = await client.query(`SELECT id, business_id FROM items WHERE business_id = $1 AND id = ANY($2::INTEGER[]) ORDER BY id FOR UPDATE`, [businessId, ids]);
  return result.rows;
}

export async function lockBusinessLocationForShare(client, { businessId, locationId }) {
  assertClient(client);
  const result = await client.query(`SELECT id FROM business_locations WHERE business_id = $1 AND id = $2 FOR KEY SHARE`, [businessId, locationId]);
  return result.rows[0] ?? null;
}

export async function createInventoryCostLayer(client, data) {
  assertClient(client);
  const result = await client.query(
    `INSERT INTO inventory_cost_layers (
      business_id, item_id, location_id, source_movement_id, source_layer_id,
      source_operation_type, source_operation_id, source_reference, received_at,
      quantity_original, quantity_available, unit_cost, created_by
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,COALESCE($9::timestamptz,CURRENT_TIMESTAMP),$10,$10,$11,$12)
    RETURNING *`,
    [data.businessId, data.itemId, data.locationId, data.sourceMovementId ?? null, data.sourceLayerId ?? null,
      data.sourceOperationType, data.sourceOperationId ?? null, data.sourceReference ?? null,
      data.receivedAt ?? null, data.quantity, data.unitCost, data.createdBy ?? null]
  );
  return result.rows[0];
}

export async function getAvailableInventoryCostLayers(client, { businessId, itemId, locationId }) {
  assertClient(client);
  const result = await client.query(`SELECT * FROM inventory_cost_layers WHERE business_id=$1 AND item_id=$2 AND location_id=$3 AND status='available' AND quantity_available > 0 ORDER BY received_at, id`, [businessId, itemId, locationId]);
  return result.rows;
}

export async function lockAvailableInventoryCostLayersForUpdate(client, { businessId, itemId, locationId }) {
  assertClient(client);
  const result = await client.query(`SELECT * FROM inventory_cost_layers WHERE business_id=$1 AND item_id=$2 AND location_id=$3 AND status='available' AND quantity_available > 0 ORDER BY received_at, id FOR UPDATE`, [businessId, itemId, locationId]);
  return result.rows;
}

export async function lockInventoryCostLayerForUpdate(client, { businessId, layerId }) {
  assertClient(client);
  const result = await client.query(`SELECT * FROM inventory_cost_layers WHERE business_id=$1 AND id=$2 FOR UPDATE`, [businessId, layerId]);
  return result.rows[0] ?? null;
}

export async function lockSourceInventoryCostLayerForShare(client, { businessId, layerId }) {
  assertClient(client);
  const result = await client.query(`SELECT id FROM inventory_cost_layers WHERE business_id=$1 AND id=$2 FOR KEY SHARE`, [businessId, layerId]);
  return result.rows[0] ?? null;
}

export async function updateInventoryCostLayerAvailability(client, { businessId, layerId, quantityAvailable }) {
  assertClient(client);
  const result = await client.query(
    `UPDATE inventory_cost_layers
     SET quantity_available=$3, status=CASE WHEN $3=0 THEN 'depleted' ELSE 'available' END,
         depleted_at=CASE WHEN $3=0 THEN CURRENT_TIMESTAMP ELSE NULL END
     WHERE business_id=$1 AND id=$2 RETURNING *`,
    [businessId, layerId, quantityAvailable]
  );
  return result.rows[0] ?? null;
}

export async function createInventoryLayerConsumption(client, data) {
  assertClient(client);
  const result = await client.query(
    `INSERT INTO inventory_layer_consumptions (
      business_id,layer_id,related_movement_id,operation_type,operation_id,
      operation_reference,quantity,unit_cost,created_by,consumed_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,COALESCE($10::timestamptz,CURRENT_TIMESTAMP)) RETURNING *`,
    [data.businessId, data.layerId, data.relatedMovementId ?? null, data.operationType, data.operationId,
      data.operationReference ?? null, data.quantity, data.unitCost, data.createdBy ?? null, data.consumedAt ?? null]
  );
  return result.rows[0];
}

export async function getInventoryLayerConsumptionCost(client, { businessId, operationType, operationId, relatedMovementId = null }) {
  assertClient(client);
  const values = [businessId, operationType, operationId];
  const movementFilter = relatedMovementId === null ? "" : " AND related_movement_id=$4";
  if (relatedMovementId !== null) values.push(relatedMovementId);
  const result = await client.query(
    `SELECT COALESCE(SUM(quantity * unit_cost),0)::NUMERIC(18,4) AS total_cost
     FROM inventory_layer_consumptions
     WHERE business_id=$1 AND operation_type=$2 AND operation_id=$3${movementFilter}`,
    values
  );
  return result.rows[0]?.total_cost ?? "0.0000";
}

export async function getProductionCost(client, { businessId, movementIds, wastePercentage, laborCost, logisticsCost, producedQuantity }) {
  assertClient(client);
  const result = await client.query(
    `WITH ingredients AS (
       SELECT COALESCE(SUM(c.quantity * c.unit_cost), 0)::NUMERIC(18,10) AS ingredient_cost
       FROM inventory_layer_consumptions c
       WHERE c.business_id = $1
         AND c.operation_type = 'production_consumption'
         AND c.related_movement_id = ANY($2::INTEGER[])
     )
     SELECT ingredient_cost,
            (ingredient_cost * (1 + $3::NUMERIC / 100)
             + $4::NUMERIC + $5::NUMERIC)::NUMERIC(18,10) AS production_cost,
            ((ingredient_cost * (1 + $3::NUMERIC / 100)
              + $4::NUMERIC + $5::NUMERIC)
             / NULLIF($6::NUMERIC, 0))::NUMERIC(18,10) AS unit_cost
     FROM ingredients`,
    [businessId, movementIds, wastePercentage ?? "0", laborCost ?? "0", logisticsCost ?? "0", producedQuantity]
  );
  return result.rows[0];
}

export async function getAvailableInventoryCostSummary(client, { businessId, itemId, locationId }) {
  assertClient(client);
  const result = await client.query(`SELECT COALESCE(SUM(quantity_available),0)::INTEGER AS quantity_available, COALESCE(SUM(quantity_available*unit_cost),0)::NUMERIC(18,4) AS inventory_value FROM inventory_cost_layers WHERE business_id=$1 AND item_id=$2 AND location_id=$3 AND status='available' AND quantity_available>0`, [businessId, itemId, locationId]);
  return result.rows[0];
}

export async function getInventoryCostValue(client, { businessId, itemId = null, locationId = null }) {
  assertClient(client);
  const values = [businessId]; const where = ["business_id=$1", "status='available'", "quantity_available>0"];
  if (itemId !== null) { values.push(itemId); where.push(`item_id=$${values.length}`); }
  if (locationId !== null) { values.push(locationId); where.push(`location_id=$${values.length}`); }
  const result = await client.query(`SELECT COALESCE(SUM(quantity_available),0)::INTEGER AS quantity_available, COALESCE(SUM(quantity_available*unit_cost),0)::NUMERIC(18,4) AS inventory_value FROM inventory_cost_layers WHERE ${where.join(" AND ")}`, values);
  return result.rows[0];
}

export async function getBusinessInventoryValuationMethod(client, { businessId }) {
  assertClient(client);
  const result = await client.query("SELECT inventory_valuation_method FROM businesses WHERE id=$1", [businessId]);
  return result.rows[0]?.inventory_valuation_method ?? null;
}
