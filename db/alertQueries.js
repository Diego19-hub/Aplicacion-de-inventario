import pool from "./pool.js";

export async function getStockAlertOptions(businessId) {
  const [categories, locations, suppliers] = await Promise.all([
    pool.query("SELECT id, name FROM categories WHERE business_id=$1 ORDER BY lower(name), id", [businessId]),
    pool.query("SELECT id, name, code FROM business_locations WHERE business_id=$1 AND status='active' ORDER BY lower(name), id", [businessId]),
    pool.query("SELECT id, name FROM suppliers WHERE business_id=$1 AND status='active' ORDER BY lower(name), id", [businessId])
  ]);
  return { categories: categories.rows, locations: locations.rows, suppliers: suppliers.rows };
}

function alertFilters({ businessId, q, categoryId, locationId, alertStatus, supplierId, priority }) {
  const values = [businessId];
  const where = ["t.business_id=$1", "t.alert_enabled=true", "i.status='active'", "l.status='active'", "(COALESCE(b.stock,0)<=t.minimum_stock OR (t.maximum_stock IS NOT NULL AND COALESCE(b.stock,0)>t.maximum_stock))"];
  if (categoryId) { values.push(categoryId); where.push(`i.category_id=$${values.length}`); }
  if (locationId) { values.push(locationId); where.push(`l.id=$${values.length}`); }
  if (q) { values.push(`%${q}%`); where.push(`(i.name ILIKE $${values.length} OR i.sku ILIKE $${values.length})`); }
  if (supplierId) { values.push(supplierId); where.push(`t.preferred_supplier_id=$${values.length}`); }
  if (priority === "urgent") where.push("COALESCE(b.stock,0)=0");
  if (priority === "high") where.push("COALESCE(b.stock,0)>0 AND COALESCE(b.stock,0)<=t.minimum_stock");
  if (priority === "medium") where.push("t.maximum_stock IS NOT NULL AND COALESCE(b.stock,0)>t.maximum_stock");
  if (alertStatus === "out_of_stock") where.push("COALESCE(b.stock,0)=0");
  if (alertStatus === "low_stock") where.push("COALESCE(b.stock,0)>0 AND COALESCE(b.stock,0)<=t.minimum_stock");
  if (alertStatus === "overstock") where.push("t.maximum_stock IS NOT NULL AND COALESCE(b.stock,0)>t.maximum_stock");
  return { values, where: where.join(" AND ") };
}

function alertBase(filters) {
  const { values, where } = alertFilters(filters);
  return { values, sql: ` FROM inventory_stock_thresholds t JOIN items i ON(i.business_id,i.id)=(t.business_id,t.item_id) JOIN categories c ON(c.business_id,c.id)=(i.business_id,i.category_id) JOIN business_locations l ON(l.business_id,l.id)=(t.business_id,t.location_id) LEFT JOIN inventory_balances b ON(b.business_id,b.item_id,b.location_id)=(t.business_id,t.item_id,t.location_id) LEFT JOIN suppliers s ON (s.business_id,s.id)=(t.business_id,t.preferred_supplier_id) WHERE ${where}` };
}

export async function getStockAlerts(filters) {
  const base = alertBase(filters);
  const count = await pool.query(`SELECT count(*)::int count${base.sql}`, base.values);
  const values = [...base.values, filters.limit, filters.offset];
  const rows = await pool.query(`SELECT t.id threshold_id,i.id item_id,i.name item_name,i.sku,i.category_id,c.name category_name,l.id location_id,l.name location_name,l.code location_code,COALESCE(b.stock,0)::int current_stock,t.minimum_stock,t.maximum_stock,CASE WHEN t.maximum_stock IS NOT NULL AND COALESCE(b.stock,0)>t.maximum_stock THEN 0 ELSE GREATEST(COALESCE(t.maximum_stock,t.minimum_stock)-COALESCE(b.stock,0),0) END suggested_quantity,t.maximum_stock-COALESCE(b.stock,0) overstock_quantity,t.preferred_supplier_id,s.name supplier_name,t.updated_at detected_at,CASE WHEN COALESCE(b.stock,0)=0 THEN 'out_of_stock' WHEN t.maximum_stock IS NOT NULL AND COALESCE(b.stock,0)>t.maximum_stock THEN 'overstock' ELSE 'low_stock' END alert_status${base.sql} ORDER BY (COALESCE(b.stock,0)=0) DESC,(t.maximum_stock IS NOT NULL AND COALESCE(b.stock,0)>t.maximum_stock) DESC,COALESCE(b.stock,0),lower(i.name),i.id,lower(l.name),l.id LIMIT $${values.length-1} OFFSET $${values.length}`, values);
  return { count: count.rows[0].count, rows: rows.rows };
}

export async function getActiveStockAlertCount(businessId) {
  const result = await getStockAlerts({ businessId, q:"", categoryId:null, locationId:null, alertStatus:"all", limit:1, offset:0 });
  return result.count;
}

export async function getItemThresholdConfiguration(businessId, itemId) {
  const item = await pool.query("SELECT id,name,sku,stock FROM items WHERE id=$1 AND business_id=$2 AND status='active'", [itemId,businessId]);
  if (!item.rows[0]) return null;
  const locations = await pool.query("SELECT l.id location_id,l.name location_name,l.code,l.is_default,COALESCE(b.stock,0)::int current_stock,t.minimum_stock,t.maximum_stock,t.suggested_replenishment,t.preferred_supplier_id,s.name supplier_name,t.alert_enabled,t.reviewed_at,t.updated_at threshold_updated_at,CASE WHEN t.id IS NULL THEN 'not_configured' WHEN COALESCE(b.stock,0)=0 THEN 'out_of_stock' WHEN t.maximum_stock IS NOT NULL AND COALESCE(b.stock,0)>t.maximum_stock THEN 'overstock' WHEN COALESCE(b.stock,0)<=t.minimum_stock THEN 'low_stock' ELSE 'ok' END alert_status FROM business_locations l LEFT JOIN inventory_balances b ON(b.business_id,b.location_id,b.item_id)=(l.business_id,l.id,$2) LEFT JOIN inventory_stock_thresholds t ON(t.business_id,t.location_id,t.item_id)=(l.business_id,l.id,$2) LEFT JOIN suppliers s ON(s.business_id,s.id)=(t.business_id,t.preferred_supplier_id) WHERE l.business_id=$1 AND l.status='active' ORDER BY l.is_default DESC,lower(l.name),l.id", [businessId,itemId]);
  const suppliers = await pool.query("SELECT id,name FROM suppliers WHERE business_id=$1 AND status='active' ORDER BY lower(name),id", [businessId]);
  return { item:item.rows[0], locations:locations.rows, suppliers:suppliers.rows };
}

export async function getThresholdScope(itemId, locationId, activeBusinessId) {
  const result = await pool.query("SELECT (SELECT id FROM items WHERE id=$1) product_id,(SELECT business_id FROM items WHERE id=$1) product_business_id,(SELECT id FROM business_locations WHERE id=$2) location_id,(SELECT business_id FROM business_locations WHERE id=$2) location_business_id,(SELECT status FROM business_locations WHERE id=$2) location_status,$3::int active_business_id", [itemId, locationId, activeBusinessId]);
  return result.rows[0] ?? { product_id: null, product_business_id: null, location_id: null, location_business_id: null, location_status: null, active_business_id: activeBusinessId };
}

export async function getActiveThresholdLocation(businessId, locationId) {
  const result = await pool.query("SELECT id,business_id,name,code,status FROM business_locations WHERE id=$1 AND business_id=$2 AND status='active'", [locationId, businessId]);
  return result.rows[0] ?? null;
}

export async function upsertStockThreshold({ businessId,productId,locationId,minStock,maxStock,preferredSupplierId,alertsEnabled,suggestedReplenishment,createdBy }) {
  const result = await pool.query("INSERT INTO inventory_stock_thresholds (business_id,item_id,location_id,minimum_stock,maximum_stock,suggested_replenishment,preferred_supplier_id,alert_enabled,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,COALESCE($8,true),$9) ON CONFLICT (business_id,item_id,location_id) DO UPDATE SET minimum_stock=EXCLUDED.minimum_stock,maximum_stock=EXCLUDED.maximum_stock,suggested_replenishment=EXCLUDED.suggested_replenishment,preferred_supplier_id=EXCLUDED.preferred_supplier_id,alert_enabled=EXCLUDED.alert_enabled,updated_at=NOW(),reviewed_at=NULL,reviewed_by=NULL RETURNING *", [businessId,productId,locationId,minStock,maxStock,suggestedReplenishment,preferredSupplierId,alertsEnabled,createdBy]);
  if (process.env.NODE_ENV !== "production") console.error("[STOCK THRESHOLD SAVE]", { productId, locationId, activeBusinessId: businessId, businessId, function: "upsertStockThreshold", rowsAffected: result.rowCount, result: result.rows[0] ?? null });
  return result.rows[0] ?? null;
}

export async function markStockAlertReviewed(businessId, thresholdId, userId) {
  const result = await pool.query("UPDATE inventory_stock_thresholds SET reviewed_at=NOW(),reviewed_by=$3 WHERE id=$1 AND business_id=$2 RETURNING *", [thresholdId,businessId,userId]);
  return result.rows[0] ?? null;
}

export async function deleteStockThreshold(businessId,itemId,locationId) {
  const result = await pool.query("DELETE FROM inventory_stock_thresholds WHERE business_id=$1 AND item_id=$2 AND location_id=$3 RETURNING *", [businessId,itemId,locationId]);
  return result.rows[0] ?? null;
}
