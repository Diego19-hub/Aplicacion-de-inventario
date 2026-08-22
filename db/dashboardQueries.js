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

export async function getDashboardMovementTrend(businessId, period = "1m") {
  const periods = {
    "1m": { bucket: "day", lookback: "1 month", step: "1 day" },
    "3m": { bucket: "week", lookback: "3 months", step: "1 week" },
    "6m": { bucket: "week", lookback: "6 months", step: "1 week" },
    "12m": { bucket: "month", lookback: "12 months", step: "1 month" }
  };
  const selected = periods[period] ?? periods["1m"];
  const result = await pool.query(
    `WITH periods AS (
       SELECT generate_series(
         date_trunc($2, CURRENT_DATE - $3::interval),
         date_trunc($2, CURRENT_DATE),
         $4::interval
       ) AS bucket_date
     ), grouped AS (
       SELECT date_trunc($2, m.created_at) AS bucket_date,
         COALESCE(SUM(CASE WHEN m.movement_type IN ('opening_balance', 'entry', 'transfer_in') THEN m.quantity_delta ELSE 0 END), 0)::INTEGER AS entries,
         COALESCE(SUM(CASE WHEN m.movement_type IN ('exit', 'transfer_out') THEN ABS(m.quantity_delta) ELSE 0 END), 0)::INTEGER AS exits,
         COALESCE(SUM(CASE WHEN m.movement_type = 'adjustment' THEN m.quantity_delta ELSE 0 END), 0)::INTEGER AS adjustments,
         COALESCE(SUM(CASE WHEN m.movement_type = 'transfer_in' THEN m.quantity_delta ELSE 0 END), 0)::INTEGER AS transfers_in,
         COALESCE(SUM(CASE WHEN m.movement_type = 'transfer_out' THEN ABS(m.quantity_delta) ELSE 0 END), 0)::INTEGER AS transfers_out
       FROM inventory_movements m
       WHERE m.business_id = $1
         AND m.created_at >= CURRENT_DATE - $3::interval
       GROUP BY date_trunc($2, m.created_at)
     )
     SELECT periods.bucket_date AS date,
       COALESCE(grouped.entries, 0)::INTEGER AS entries,
       COALESCE(grouped.exits, 0)::INTEGER AS exits,
       COALESCE(grouped.adjustments, 0)::INTEGER AS adjustments,
       COALESCE(grouped.transfers_in, 0)::INTEGER AS transfers_in,
       COALESCE(grouped.transfers_out, 0)::INTEGER AS transfers_out
     FROM periods LEFT JOIN grouped USING (bucket_date)
     ORDER BY periods.bucket_date`,
    [businessId, selected.bucket, selected.lookback, selected.step]
  );
  return result.rows;
}

export async function getDashboardStockByCategory(businessId) {
  const result = await pool.query(
    `SELECT c.id, c.name, COALESCE(SUM(b.stock), 0)::INTEGER AS total_stock
     FROM categories c
     INNER JOIN items i ON (i.business_id, i.category_id) = (c.business_id, c.id) AND i.status = 'active'
     LEFT JOIN inventory_balances b ON (b.business_id, b.item_id) = (i.business_id, i.id)
     WHERE c.business_id = $1
     GROUP BY c.id, c.name ORDER BY total_stock DESC, LOWER(c.name), c.id`,
    [businessId]
  );
  return result.rows;
}

export async function getDashboardLowStockProducts(businessId) {
  const result = await pool.query(
    `SELECT i.id, i.name, i.sku, c.name AS category_name,
       COALESCE(SUM(b.stock), 0)::INTEGER AS total_stock,
       MAX(t.minimum_stock)::INTEGER AS minimum_stock,
       COUNT(*) FILTER (WHERE COALESCE(b.stock, 0) <= t.minimum_stock)::INTEGER AS low_stock_locations
     FROM inventory_stock_thresholds t
     INNER JOIN items i ON (i.business_id, i.id) = (t.business_id, t.item_id) AND i.status = 'active'
     INNER JOIN categories c ON (c.business_id, c.id) = (i.business_id, i.category_id)
     LEFT JOIN inventory_balances b ON (b.business_id, b.item_id, b.location_id) = (t.business_id, t.item_id, t.location_id)
     WHERE t.business_id = $1
     GROUP BY i.id, i.name, i.sku, c.name
     HAVING COUNT(*) FILTER (WHERE COALESCE(b.stock, 0) <= t.minimum_stock) > 0
     ORDER BY low_stock_locations DESC, total_stock, LOWER(i.name), i.id LIMIT 8`,
    [businessId]
  );
  return result.rows;
}
