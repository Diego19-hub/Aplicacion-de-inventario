import pool from "./pool.js";

const typeSql = `CASE
  WHEN m.reference LIKE 'SALE-%' THEN 'sale'
  WHEN m.reference LIKE 'RECIPE-%' THEN 'production'
  WHEN m.movement_type IN ('transfer_out','transfer_in') THEN 'transfer'
  WHEN m.movement_type = 'opening_balance' THEN 'entry'
  ELSE m.movement_type
END`;

function filters({ businessId, q = "", type = "", dateFrom = null, dateTo = null, locationId = null, userId = null }) {
  const values = [businessId]; const where = ["m.business_id = $1"];
  if (q) { values.push(`%${q}%`); where.push(`(i.name ILIKE $${values.length} OR i.sku ILIKE $${values.length} OR COALESCE(m.reference, '') ILIKE $${values.length})`); }
  if (type) { values.push(type); where.push(`${typeSql} = $${values.length}`); }
  if (dateFrom) { values.push(dateFrom); where.push(`m.created_at >= $${values.length}::date`); }
  if (dateTo) { values.push(dateTo); where.push(`m.created_at < ($${values.length}::date + INTERVAL '1 day')`); }
  if (locationId) { values.push(locationId); where.push(`(m.location_id = $${values.length} OR t.from_location_id = $${values.length} OR t.to_location_id = $${values.length})`); }
  if (userId) { values.push(userId); where.push(`m.created_by = $${values.length}`); }
  return { values, where: where.join(" AND ") };
}

const select = `SELECT m.id, m.created_at, m.movement_type, m.quantity_delta, m.previous_stock, m.resulting_stock, m.reason, m.reference, ${typeSql} AS transaction_type, i.id AS product_id, i.name AS product_name, i.sku, i.cost_price, l.id AS location_id, l.name AS location_name, l.code AS location_code, t.from_location_id, fl.name AS from_location_name, t.to_location_id, tl.name AS to_location_name, u.id AS user_id, u.username, COALESCE(ABS(m.quantity_delta) * i.cost_price, 0) AS cost FROM inventory_movements m INNER JOIN items i ON (i.business_id,i.id)=(m.business_id,m.item_id) INNER JOIN business_locations l ON (l.business_id,l.id)=(m.business_id,m.location_id) INNER JOIN users u ON u.id=m.created_by LEFT JOIN inventory_transfers t ON (t.business_id,t.id)=(m.business_id,m.transfer_id) LEFT JOIN business_locations fl ON (fl.business_id,fl.id)=(t.business_id,t.from_location_id) LEFT JOIN business_locations tl ON (tl.business_id,tl.id)=(t.business_id,t.to_location_id)`;

export async function listTransactions({ businessId, ...params }) {
  const { values, where } = filters({ businessId, ...params });
  const count = await pool.query(`SELECT COUNT(*)::INTEGER AS count FROM inventory_movements m INNER JOIN items i ON (i.business_id,i.id)=(m.business_id,m.item_id) LEFT JOIN inventory_transfers t ON (t.business_id,t.id)=(m.business_id,m.transfer_id) WHERE ${where}`, values);
  const pageValues = [...values, params.limit, params.offset];
  const rows = await pool.query(`${select} WHERE ${where} ORDER BY m.created_at DESC, m.id DESC LIMIT $${pageValues.length - 1} OFFSET $${pageValues.length}`, pageValues);
  return { count: Number(count.rows[0].count), rows: rows.rows };
}

export async function getTransaction({ businessId, transactionId }) {
  const result = await pool.query(`${select} WHERE m.business_id=$1 AND m.id=$2`, [businessId, transactionId]);
  return result.rows[0] ?? null;
}

export async function getTransactionOptions(businessId) {
  const [locations, users, products] = await Promise.all([
    pool.query("SELECT id,name,code FROM business_locations WHERE business_id=$1 ORDER BY LOWER(name),id", [businessId]),
    pool.query("SELECT DISTINCT u.id,u.username FROM users u INNER JOIN inventory_movements m ON m.created_by=u.id AND m.business_id=$1 ORDER BY u.username", [businessId]),
    pool.query("SELECT id,name,sku FROM items WHERE business_id=$1 AND status='active' ORDER BY LOWER(name),id", [businessId])
  ]);
  return { locations: locations.rows, users: users.rows, products: products.rows };
}
