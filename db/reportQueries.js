import pool from "./pool.js";
export async function inventoryOptions(businessId) {
  const [categories, locations] = await Promise.all([
    pool.query(
      "SELECT id,name FROM categories WHERE business_id=$1 ORDER BY lower(name)",
      [businessId],
    ),
    pool.query(
      "SELECT id,name,code FROM business_locations WHERE business_id=$1 ORDER BY lower(name)",
      [businessId],
    ),
  ]);
  return { categories: categories.rows, locations: locations.rows };
}
function filters({ businessId, q, categoryId, locationId, status, stockRows }) {
  const v = [businessId],
    w = ["i.business_id=$1"];
  if (q) {
    v.push("%" + q + "%");
    w.push(`(i.name ILIKE $${v.length} OR i.sku ILIKE $${v.length})`);
  }
  if (categoryId) {
    v.push(categoryId);
    w.push(`i.category_id=$${v.length}`);
  }
  if (locationId) {
    v.push(locationId);
    w.push(`l.id=$${v.length}`);
  }
  if (status !== "all") {
    v.push(status);
    w.push(`i.status=$${v.length}`);
  }
  if (stockRows === "positive") w.push("COALESCE(b.stock,0)>0");
  return { v, w: w.join(" AND ") };
}
export async function inventoryReport(f) {
  const x = filters(f);
  const base = ` FROM items i JOIN categories c ON(c.business_id,c.id)=(i.business_id,i.category_id) CROSS JOIN business_locations l LEFT JOIN inventory_balances b ON(b.business_id,b.location_id,b.item_id)=(i.business_id,l.id,i.id) WHERE l.business_id=$1 AND (l.status='active' OR COALESCE(b.stock,0)>0) AND ${x.w}`;
  const count = await pool.query("SELECT count(*)::int count" + base, x.v);
  const v = [...x.v, f.limit, f.offset];
  const rows = await pool.query(
    `SELECT i.id,i.name,i.sku,i.status product_status,i.category_id,c.name category_name,l.id location_id,l.name location_name,l.code,l.location_type,l.status location_status,COALESCE(b.stock,0)::int local_stock,i.stock total_stock ${base} ORDER BY lower(i.name),i.id,lower(l.name),l.id LIMIT $${v.length - 1} OFFSET $${v.length}`,
    v,
  );
  return { count: count.rows[0].count, rows: rows.rows };
}

export async function inventoryExport(f) {
  const x = filters(f);
  const base = ` FROM items i JOIN categories c ON(c.business_id,c.id)=(i.business_id,i.category_id) CROSS JOIN business_locations l LEFT JOIN inventory_balances b ON(b.business_id,b.location_id,b.item_id)=(i.business_id,l.id,i.id) WHERE l.business_id=$1 AND (l.status='active' OR COALESCE(b.stock,0)>0) AND ${x.w}`;
  const result = await pool.query(
    `SELECT i.name,i.sku,i.status product_status,c.name category_name,l.name location_name,l.code,l.location_type,l.status location_status,COALESCE(b.stock,0)::int local_stock,i.stock total_stock ${base} ORDER BY lower(i.name),i.id,lower(l.name),l.id`,
    x.v,
  );
  return result.rows;
}
export async function movementOptions(businessId) {
  const [users, locations] = await Promise.all([
    pool.query(
      "SELECT DISTINCT u.id,u.username FROM inventory_movements m JOIN users u ON u.id=m.created_by WHERE m.business_id=$1 ORDER BY u.username",
      [businessId],
    ),
    pool.query(
      "SELECT id,name,code FROM business_locations WHERE business_id=$1 ORDER BY lower(name)",
      [businessId],
    ),
  ]);
  return { users: users.rows, locations: locations.rows };
}
export async function movementReport(f) {
  const v = [f.businessId],
    w = ["m.business_id=$1"];
  if (f.role !== "owner") w.push("i.status='active'");
  if (f.q) {
    v.push("%" + f.q + "%");
    w.push(
      `(i.name ILIKE $${v.length} OR i.sku ILIKE $${v.length} OR m.reference ILIKE $${v.length})`,
    );
  }
  if (f.locationId) {
    v.push(f.locationId);
    w.push(`m.location_id=$${v.length}`);
  }
  if (f.userId) {
    v.push(f.userId);
    w.push(`m.created_by=$${v.length}`);
  }
  if (f.type) {
    v.push(f.type);
    w.push(`m.movement_type=$${v.length}`);
  }
  if (f.dateFrom) {
    v.push(f.dateFrom);
    w.push(`m.created_at >= $${v.length}::date`);
  }
  if (f.dateTo) {
    v.push(f.dateTo);
    w.push(`m.created_at < ($${v.length}::date+interval '1 day')`);
  }
  const base = ` FROM inventory_movements m JOIN items i ON(i.business_id,i.id)=(m.business_id,m.item_id) JOIN business_locations l ON(l.business_id,l.id)=(m.business_id,m.location_id) JOIN users u ON u.id=m.created_by WHERE ${w.join(" AND ")}`;
  const count = await pool.query("SELECT count(*)::int count" + base, v);
  const p = [...v, f.limit, f.offset];
  const rows = await pool.query(
    `SELECT
  m.*,
  i.name AS item_name,
  i.sku,
  i.status AS product_status,
  l.name AS location_name,
  l.code,
  u.username ${base} ORDER BY m.created_at DESC,m.id DESC LIMIT $${p.length - 1} OFFSET $${p.length}`,
    p,
  );
  return { count: count.rows[0].count, rows: rows.rows };
}

export async function movementExport(f) {
  const v = [f.businessId], w = ["m.business_id=$1"];
  if (f.role !== "owner") w.push("i.status='active'");
  if (f.q) { v.push("%" + f.q + "%"); w.push(`(i.name ILIKE $${v.length} OR i.sku ILIKE $${v.length} OR m.reference ILIKE $${v.length})`); }
  if (f.locationId) { v.push(f.locationId); w.push(`m.location_id=$${v.length}`); }
  if (f.userId) { v.push(f.userId); w.push(`m.created_by=$${v.length}`); }
  if (f.type) { v.push(f.type); w.push(`m.movement_type=$${v.length}`); }
  if (f.dateFrom) { v.push(f.dateFrom); w.push(`m.created_at >= $${v.length}::date`); }
  if (f.dateTo) { v.push(f.dateTo); w.push(`m.created_at < ($${v.length}::date+interval '1 day')`); }
  const base = ` FROM inventory_movements m JOIN items i ON(i.business_id,i.id)=(m.business_id,m.item_id) JOIN business_locations l ON(l.business_id,l.id)=(m.business_id,m.location_id) JOIN users u ON u.id=m.created_by WHERE ${w.join(" AND ")}`;
  const result = await pool.query(`SELECT m.*,i.name item_name,i.sku,l.name location_name,l.code,u.username ${base} ORDER BY m.created_at DESC,m.id DESC`, v);
  return result.rows;
}
