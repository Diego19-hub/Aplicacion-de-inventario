import pool from "./pool.js";

export async function getStockAlertOptions(businessId) {
  const [categories, locations] = await Promise.all([
    pool.query("SELECT id, name FROM categories WHERE business_id=$1 ORDER BY lower(name), id", [businessId]),
    pool.query("SELECT id, name, code FROM business_locations WHERE business_id=$1 AND status='active' ORDER BY lower(name), id", [businessId])
  ]);
  return { categories: categories.rows, locations: locations.rows };
}

function alertFilters({ businessId, q, categoryId, locationId, alertStatus }) {
  const values = [businessId];
  const where = ["t.business_id=$1", "i.status='active'", "l.status='active'", "COALESCE(b.stock,0)<=t.minimum_stock"];
  if (categoryId) { values.push(categoryId); where.push(`i.category_id=$${values.length}`); }
  if (locationId) { values.push(locationId); where.push(`l.id=$${values.length}`); }
  if (q) { values.push(`%${q}%`); where.push(`(i.name ILIKE $${values.length} OR i.sku ILIKE $${values.length})`); }
  if (alertStatus === "out_of_stock") where.push("COALESCE(b.stock,0)=0");
  if (alertStatus === "low_stock") where.push("COALESCE(b.stock,0)>0");
  return { values, where: where.join(" AND ") };
}

function alertBase(filters) {
  const { values, where } = alertFilters(filters);
  return { values, sql: ` FROM inventory_stock_thresholds t JOIN items i ON(i.business_id,i.id)=(t.business_id,t.item_id) JOIN categories c ON(c.business_id,c.id)=(i.business_id,i.category_id) JOIN business_locations l ON(l.business_id,l.id)=(t.business_id,t.location_id) LEFT JOIN inventory_balances b ON(b.business_id,b.item_id,b.location_id)=(t.business_id,t.item_id,t.location_id) WHERE ${where}` };
}

export async function getStockAlerts(filters) {
  const base = alertBase(filters);
  const count = await pool.query(`SELECT count(*)::int count${base.sql}`, base.values);
  const values = [...base.values, filters.limit, filters.offset];
  const rows = await pool.query(`SELECT t.id threshold_id,i.id item_id,i.name item_name,i.sku,i.category_id,c.name category_name,l.id location_id,l.name location_name,l.code location_code,COALESCE(b.stock,0)::int current_stock,t.minimum_stock,CASE WHEN COALESCE(b.stock,0)=0 THEN 'out_of_stock' ELSE 'low_stock' END alert_status${base.sql} ORDER BY (COALESCE(b.stock,0)=0) DESC,COALESCE(b.stock,0),lower(i.name),i.id,lower(l.name),l.id LIMIT $${values.length-1} OFFSET $${values.length}`, values);
  return { count: count.rows[0].count, rows: rows.rows };
}

export async function getActiveStockAlertCount(businessId) {
  const result = await getStockAlerts({ businessId, q:"", categoryId:null, locationId:null, alertStatus:"all", limit:1, offset:0 });
  return result.count;
}

export async function getItemThresholdConfiguration(businessId, itemId) {
  const item = await pool.query("SELECT id,name,sku,stock FROM items WHERE id=$1 AND business_id=$2 AND status='active'", [itemId,businessId]);
  if (!item.rows[0]) return null;
  const locations = await pool.query("SELECT l.id location_id,l.name location_name,l.code,l.is_default,COALESCE(b.stock,0)::int current_stock,t.minimum_stock,t.updated_at threshold_updated_at,CASE WHEN t.id IS NULL THEN 'not_configured' WHEN COALESCE(b.stock,0)=0 THEN 'out_of_stock' WHEN COALESCE(b.stock,0)<=t.minimum_stock THEN 'low_stock' ELSE 'ok' END alert_status FROM business_locations l LEFT JOIN inventory_balances b ON(b.business_id,b.location_id,b.item_id)=(l.business_id,l.id,$2) LEFT JOIN inventory_stock_thresholds t ON(t.business_id,t.location_id,t.item_id)=(l.business_id,l.id,$2) WHERE l.business_id=$1 AND l.status='active' ORDER BY l.is_default DESC,lower(l.name),l.id", [businessId,itemId]);
  return { item:item.rows[0], locations:locations.rows };
}

export async function upsertStockThreshold({ businessId,itemId,locationId,minimumStock,createdBy }) {
  const result = await pool.query("WITH valid AS (SELECT $1::int business_id WHERE EXISTS(SELECT 1 FROM items WHERE id=$2 AND business_id=$1 AND status='active') AND EXISTS(SELECT 1 FROM business_locations WHERE id=$3 AND business_id=$1 AND status='active') AND EXISTS(SELECT 1 FROM business_members WHERE business_id=$1 AND user_id=$5 AND status='active')) INSERT INTO inventory_stock_thresholds(business_id,item_id,location_id,minimum_stock,created_by) SELECT business_id,$2,$3,$4,$5 FROM valid ON CONFLICT(business_id,item_id,location_id) DO UPDATE SET minimum_stock=EXCLUDED.minimum_stock RETURNING *", [businessId,itemId,locationId,minimumStock,createdBy]);
  return result.rows[0] ?? null;
}

export async function deleteStockThreshold(businessId,itemId,locationId) {
  const result = await pool.query("DELETE FROM inventory_stock_thresholds WHERE business_id=$1 AND item_id=$2 AND location_id=$3 RETURNING *", [businessId,itemId,locationId]);
  return result.rows[0] ?? null;
}
