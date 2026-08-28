import pool from "./pool.js";

function whereFor({ businessId, q = "", productId = null, categoryId = null, locationId = null, userId = null, type = "", dateFrom = null, dateTo = null, supplier = "" }) {
  const values = [businessId]; const where = ["m.business_id=$1"];
  if (q) { values.push(`%${q}%`); where.push(`(i.name ILIKE $${values.length} OR i.sku ILIKE $${values.length} OR COALESCE(m.reference,'') ILIKE $${values.length})`); }
  if (supplier) { values.push(`%${supplier}%`); where.push(`COALESCE(m.reason,'') ILIKE $${values.length}`); }
  if (productId) { values.push(productId); where.push(`m.item_id=$${values.length}`); }
  if (categoryId) { values.push(categoryId); where.push(`i.category_id=$${values.length}`); }
  if (locationId) { values.push(locationId); where.push(`m.location_id=$${values.length}`); }
  if (userId) { values.push(userId); where.push(`m.created_by=$${values.length}`); }
  if (type) { values.push(type); where.push(`CASE WHEN m.reference LIKE 'SALE-%' THEN 'sale' WHEN m.reference LIKE 'RECIPE-%' THEN 'production' WHEN m.movement_type IN ('transfer_in','transfer_out') THEN 'transfer' WHEN m.movement_type='opening_balance' THEN 'entry' ELSE m.movement_type END=$${values.length}`); }
  if (dateFrom) { values.push(dateFrom); where.push(`m.created_at >= $${values.length}::date`); }
  if (dateTo) { values.push(dateTo); where.push(`m.created_at < ($${values.length}::date + interval '1 day')`); }
  return { values, where: where.join(" AND ") };
}

export async function inventoryCenterOptions(businessId) { const [categories, locations, users, products] = await Promise.all([pool.query("SELECT id,name FROM categories WHERE business_id=$1 ORDER BY LOWER(name),id", [businessId]), pool.query("SELECT id,name,code FROM business_locations WHERE business_id=$1 ORDER BY LOWER(name),id", [businessId]), pool.query("SELECT DISTINCT u.id,u.username FROM users u JOIN inventory_movements m ON m.created_by=u.id AND m.business_id=$1 ORDER BY u.username", [businessId]), pool.query("SELECT id,name,sku FROM items WHERE business_id=$1 ORDER BY LOWER(name),id", [businessId])]); return { categories: categories.rows, locations: locations.rows, users: users.rows, products: products.rows }; }

export async function inventoryCenterReport({ businessId, ...filters }) {
  const movement = whereFor({ businessId, ...filters });
  const base = `FROM inventory_movements m JOIN items i ON (i.business_id,i.id)=(m.business_id,m.item_id) JOIN categories c ON (c.business_id,c.id)=(i.business_id,i.category_id) JOIN business_locations l ON (l.business_id,l.id)=(m.business_id,m.location_id) JOIN users u ON u.id=m.created_by WHERE ${movement.where}`;
  const movements = await pool.query(`SELECT m.id,m.created_at,m.movement_type,m.quantity_delta,m.reference,m.reason,i.id item_id,i.name item_name,i.sku,c.name category_name,l.name location_name,u.username,i.cost_price,ABS(m.quantity_delta)*COALESCE(i.cost_price,0) cost ${base} ORDER BY m.created_at DESC,m.id DESC LIMIT $${movement.values.length + 1} OFFSET $${movement.values.length + 2}`, [...movement.values, filters.limit, filters.offset]);
  const count = await pool.query(`SELECT COUNT(*)::INTEGER count ${base}`, movement.values);
  const inventory = await pool.query(`SELECT i.id,i.name,i.sku,c.name category_name,l.name location_name,COALESCE(b.stock,0)::INTEGER stock,COALESCE(i.cost_price,0) cost_price,COALESCE(b.stock,0)*COALESCE(i.cost_price,0) total_value,COALESCE(t.minimum_stock,0)::INTEGER minimum_stock,CASE WHEN COALESCE(b.stock,0)=0 THEN 'out_of_stock' WHEN t.minimum_stock IS NOT NULL AND b.stock<=t.minimum_stock THEN 'low_stock' ELSE 'sufficient' END stock_status FROM items i JOIN categories c ON(c.business_id,c.id)=(i.business_id,i.category_id) CROSS JOIN business_locations l LEFT JOIN inventory_balances b ON(b.business_id,b.location_id,b.item_id)=(i.business_id,l.id,i.id) LEFT JOIN inventory_stock_thresholds t ON(t.business_id,t.location_id,t.item_id)=(i.business_id,l.id,i.id) WHERE i.business_id=$1 AND i.status='active' AND l.business_id=$1 AND (l.status='active' OR COALESCE(b.stock,0)>0) AND ($2='' OR i.name ILIKE '%'||$2||'%' OR i.sku ILIKE '%'||$2||'%') AND ($3::INTEGER IS NULL OR i.id=$3) AND ($4::INTEGER IS NULL OR i.category_id=$4) AND ($5::INTEGER IS NULL OR l.id=$5) ORDER BY LOWER(i.name),l.id`, [businessId, filters.q || "", filters.productId || null, filters.categoryId || null, filters.locationId || null]);
  const without = await pool.query(`SELECT i.id,i.name,i.sku,MAX(m.created_at) last_activity,i.stock FROM items i LEFT JOIN inventory_movements m ON(m.business_id,m.item_id)=(i.business_id,i.id) JOIN categories c ON(c.business_id,c.id)=(i.business_id,i.category_id) WHERE i.business_id=$1 AND i.status='active' GROUP BY i.id ORDER BY last_activity NULLS FIRST,LOWER(i.name)`, [businessId]);
  const low = inventory.rows.filter((row) => row.stock_status === "low_stock" || row.stock_status === "out_of_stock");
  return { inventory: inventory.rows, movements: movements.rows, withoutMovement: without.rows, lowStock: low, movementCount: Number(count.rows[0].count) };
}
