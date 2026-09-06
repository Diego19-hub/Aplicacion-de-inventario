import pool from "./pool.js";

const moneyPattern = "FM9999999990.0000";

function locationFilter(locationId, values) {
  if (locationId === null) return "";
  values.push(locationId);
  return ` AND l.location_id = $${values.length}`;
}

export async function getApiProductCostLayerData({ businessId, itemId, locationId = null }) {
  const valuation = await pool.query(
    `SELECT COALESCE(b.inventory_valuation_method, 'average') AS valuation_method
     FROM businesses b
     INNER JOIN items i ON i.business_id = b.id
     WHERE b.id = $1 AND b.status = 'active' AND i.business_id = b.id AND i.id = $2 AND i.status = 'active'`,
    [businessId, itemId]
  );
  const valuationMethod = valuation.rows[0]?.valuation_method ?? null;
  if (!valuationMethod || valuationMethod === "average") {
    return { valuationMethod: valuationMethod ?? "average", layers: [], consumptions: [] };
  }

  const layerValues = [businessId, itemId];
  const layerLocationFilter = locationFilter(locationId, layerValues);
  const layers = await pool.query(
    `SELECT
       l.id,
       l.received_at,
       l.location_id,
       bl.name AS location_name,
       bl.code AS location_code,
       l.quantity_original,
       l.quantity_available,
       COALESCE(SUM(c.quantity), 0)::INTEGER AS quantity_consumed,
       TO_CHAR(l.unit_cost, '${moneyPattern}') AS unit_cost,
       TO_CHAR((l.quantity_available * l.unit_cost)::NUMERIC(18,4), '${moneyPattern}') AS available_value,
       l.source_reference,
       l.source_operation_type,
       CASE
         WHEN l.quantity_available = 0 THEN 'depleted'
         WHEN l.quantity_available = l.quantity_original THEN 'available'
         ELSE 'partial'
       END AS layer_status
     FROM inventory_cost_layers l
     INNER JOIN business_locations bl
       ON (bl.business_id, bl.id) = (l.business_id, l.location_id)
     LEFT JOIN inventory_layer_consumptions c
       ON (c.business_id, c.layer_id) = (l.business_id, l.id)
     WHERE l.business_id = $1 AND l.item_id = $2${layerLocationFilter}
     GROUP BY l.id, bl.name, bl.code
     ORDER BY l.received_at ASC, l.id ASC`,
    layerValues
  );

  const consumptionValues = [businessId, itemId];
  const consumptionLocationFilter = locationFilter(locationId, consumptionValues);
  const consumptions = await pool.query(
    `SELECT
       c.id,
       c.layer_id,
       c.consumed_at,
       c.quantity,
       TO_CHAR(c.unit_cost, '${moneyPattern}') AS unit_cost,
       TO_CHAR((c.quantity * c.unit_cost)::NUMERIC(18,4), '${moneyPattern}') AS total_cost,
       c.operation_type,
       c.operation_reference,
       l.location_id,
       bl.name AS location_name,
       bl.code AS location_code
     FROM inventory_layer_consumptions c
     INNER JOIN inventory_cost_layers l
       ON (l.business_id, l.id) = (c.business_id, c.layer_id)
     INNER JOIN business_locations bl
       ON (bl.business_id, bl.id) = (l.business_id, l.location_id)
     WHERE c.business_id = $1 AND l.item_id = $2${consumptionLocationFilter}
     ORDER BY c.consumed_at ASC, c.id ASC`,
    consumptionValues
  );

  return {
    valuationMethod,
    layers: layers.rows,
    consumptions: consumptions.rows
  };
}
