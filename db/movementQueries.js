import pool from "./pool.js";

export async function getMovementHistory({ businessId, itemId, locationId, limit, offset }) {
  const values = [businessId, itemId]; const locationFilter = locationId ? ` AND m.location_id = $3` : ""; if (locationId) values.push(locationId); values.push(limit, offset);
  const result = await pool.query(`SELECT m.*, u.username, l.name AS location_name, l.code AS location_code FROM inventory_movements m JOIN users u ON u.id = m.created_by JOIN business_locations l ON (l.business_id,l.id)=(m.business_id,m.location_id) WHERE m.business_id = $1 AND m.item_id = $2${locationFilter} ORDER BY m.created_at DESC, m.id DESC LIMIT $${values.length - 1} OFFSET $${values.length}`, values);
  return result.rows;
}

export async function countMovements(businessId, itemId, locationId) {
  const result = await pool.query(`SELECT COUNT(*)::INTEGER AS count FROM inventory_movements WHERE business_id = $1 AND item_id = $2${locationId ? " AND location_id = $3" : ""}`, locationId ? [businessId, itemId, locationId] : [businessId, itemId]);
  return result.rows[0].count;
}

export async function recordMovement({ businessId, itemId, userId, locationId, movementType, quantity, reason, reference }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const itemResult = await client.query("SELECT stock FROM items WHERE id = $1 AND business_id = $2 AND status = 'active' FOR UPDATE", [itemId, businessId]);
    const item = itemResult.rows[0];
    if (!item) { await client.query("ROLLBACK"); return { error: "not_found" }; }
    const locationResult = await client.query("SELECT id FROM business_locations WHERE id = $1 AND business_id = $2 AND status = 'active' FOR KEY SHARE", [locationId, businessId]);
    if (!locationResult.rows[0]) { await client.query("ROLLBACK"); return { error: "location_not_found" }; }
    await client.query("INSERT INTO inventory_balances (business_id, location_id, item_id, stock) VALUES ($1,$2,$3,0) ON CONFLICT DO NOTHING", [businessId, locationId, itemId]);
    const balanceResult = await client.query("SELECT stock FROM inventory_balances WHERE business_id=$1 AND location_id=$2 AND item_id=$3 FOR UPDATE", [businessId, locationId, itemId]);
    const previousStock = balanceResult.rows[0].stock;
    const quantityDelta = movementType === "exit" ? -quantity : movementType === "adjustment" ? quantity - previousStock : quantity;
    if (movementType === "adjustment" && quantityDelta === 0) { await client.query("ROLLBACK"); return { error: "same_stock" }; }
    const resultingStock = previousStock + quantityDelta;
    if (resultingStock < 0) { await client.query("ROLLBACK"); return { error: "negative_stock" }; }
    const movement = await client.query(`INSERT INTO inventory_movements (business_id, location_id, item_id, movement_type, quantity_delta, previous_stock, resulting_stock, reason, reference, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id, resulting_stock`, [businessId, locationId, itemId, movementType, quantityDelta, previousStock, resultingStock, reason, reference || null, userId]);
    await client.query("UPDATE inventory_balances SET stock = $1 WHERE business_id=$2 AND location_id=$3 AND item_id=$4", [resultingStock, businessId, locationId, itemId]);
    await client.query("UPDATE items SET stock = stock + $1 WHERE id = $2 AND business_id = $3 AND status = 'active'", [quantityDelta, itemId, businessId]);
    await client.query("COMMIT");
    return movement.rows[0];
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}
