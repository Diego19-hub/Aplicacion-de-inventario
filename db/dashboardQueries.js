import pool from "./pool.js";

export async function getDashboardSummary(businessId) {
  const result = await pool.query(
    `
      SELECT
        COUNT(i.id)::INTEGER AS active_products,
        COALESCE(SUM(i.stock), 0)::INTEGER AS total_units,
        COALESCE(SUM(i.price * i.stock), 0) AS inventory_value,
        (
          SELECT COUNT(*)::INTEGER
          FROM inventory_stock_thresholds t
          INNER JOIN items threshold_items
            ON (threshold_items.business_id, threshold_items.id) = (t.business_id, t.item_id)
          INNER JOIN business_locations threshold_locations
            ON (threshold_locations.business_id, threshold_locations.id) = (t.business_id, t.location_id)
          LEFT JOIN inventory_balances b
            ON (b.business_id, b.item_id, b.location_id) = (t.business_id, t.item_id, t.location_id)
          WHERE t.business_id = $1
            AND threshold_items.status = 'active'
            AND threshold_locations.status = 'active'
            AND COALESCE(b.stock, 0) <= t.minimum_stock
        ) AS low_stock_alerts,
        (
          SELECT COUNT(*)::INTEGER
          FROM business_locations locations
          WHERE locations.business_id = $1
            AND locations.status = 'active'
        ) AS active_locations
      FROM items i
      WHERE i.business_id = $1
        AND i.status = 'active'
    `,
    [businessId]
  );

  return result.rows[0];
}

export async function getRecentDashboardMovements(businessId) {
  const result = await pool.query(
    `
      SELECT
        m.id,
        m.created_at,
        i.name AS item_name,
        i.sku,
        l.name AS location_name,
        l.code AS location_code,
        m.movement_type,
        m.quantity_delta,
        u.username
      FROM inventory_movements m
      INNER JOIN items i
        ON (i.business_id, i.id) = (m.business_id, m.item_id)
      INNER JOIN business_locations l
        ON (l.business_id, l.id) = (m.business_id, m.location_id)
      INNER JOIN users u
        ON u.id = m.created_by
      WHERE m.business_id = $1
      ORDER BY m.created_at DESC, m.id DESC
      LIMIT 5
    `,
    [businessId]
  );

  return result.rows;
}

export async function getDashboardStockByLocation(businessId) {
  const result = await pool.query(
    `
      SELECT
        l.id,
        l.name,
        l.code,
        COALESCE(SUM(CASE WHEN i.id IS NOT NULL THEN b.stock ELSE 0 END), 0)::INTEGER AS total_stock
      FROM business_locations l
      LEFT JOIN inventory_balances b
        ON (b.business_id, b.location_id) = (l.business_id, l.id)
      LEFT JOIN items i
        ON (i.business_id, i.id) = (b.business_id, b.item_id)
        AND i.status = 'active'
      WHERE l.business_id = $1
        AND l.status = 'active'
      GROUP BY l.id, l.name, l.code
      ORDER BY LOWER(l.name), l.id
    `,
    [businessId]
  );

  return result.rows;
}
