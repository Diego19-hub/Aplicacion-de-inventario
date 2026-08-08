import pool from "./pool.js";

export async function getMovementHistory({ businessId, itemId, limit, offset }) {
  const result = await pool.query(`SELECT m.*, u.username FROM inventory_movements m JOIN users u ON u.id = m.created_by WHERE m.business_id = $1 AND m.item_id = $2 ORDER BY m.created_at DESC, m.id DESC LIMIT $3 OFFSET $4`, [businessId, itemId, limit, offset]);
  return result.rows;
}

export async function countMovements(businessId, itemId) {
  const result = await pool.query("SELECT COUNT(*)::INTEGER AS count FROM inventory_movements WHERE business_id = $1 AND item_id = $2", [businessId, itemId]);
  return result.rows[0].count;
}

export async function recordMovement({ businessId, itemId, userId, movementType, quantity, reason, reference }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const itemResult = await client.query("SELECT stock FROM items WHERE id = $1 AND business_id = $2 AND status = 'active' FOR UPDATE", [itemId, businessId]);
    const item = itemResult.rows[0];
    if (!item) { await client.query("ROLLBACK"); return { error: "not_found" }; }
    const previousStock = item.stock;
    const quantityDelta = movementType === "exit" ? -quantity : movementType === "adjustment" ? quantity - previousStock : quantity;
    if (movementType === "adjustment" && quantityDelta === 0) { await client.query("ROLLBACK"); return { error: "same_stock" }; }
    const resultingStock = previousStock + quantityDelta;
    if (resultingStock < 0) { await client.query("ROLLBACK"); return { error: "negative_stock" }; }
    const movement = await client.query(`INSERT INTO inventory_movements (business_id, item_id, movement_type, quantity_delta, previous_stock, resulting_stock, reason, reference, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id, resulting_stock`, [businessId, itemId, movementType, quantityDelta, previousStock, resultingStock, reason, reference || null, userId]);
    await client.query("UPDATE items SET stock = $1 WHERE id = $2 AND business_id = $3 AND status = 'active'", [resultingStock, itemId, businessId]);
    await client.query("COMMIT");
    return movement.rows[0];
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}
