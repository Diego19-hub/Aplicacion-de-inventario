import pool from "./pool.js";

export async function getAssistantBusinessContext(businessId) {
  const [summaryResult, productsResult, movementsResult, salesResult] = await Promise.all([
    pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'active')::INTEGER AS active_products,
         COALESCE(SUM(stock) FILTER (WHERE status = 'active'), 0)::INTEGER AS total_units
       FROM items
       WHERE business_id = $1`,
      [businessId]
    ),
    pool.query(
      `SELECT i.id, i.name, i.sku, COALESCE(SUM(b.stock), 0)::INTEGER AS stock
       FROM items i
       LEFT JOIN inventory_balances b
         ON (b.business_id, b.item_id) = (i.business_id, i.id)
       WHERE i.business_id = $1 AND i.status = 'active'
       GROUP BY i.id, i.name, i.sku
       ORDER BY LOWER(i.name), i.id
       LIMIT 40`,
      [businessId]
    ),
    pool.query(
      `SELECT m.created_at, m.movement_type, m.quantity_delta,
              i.name AS product_name, i.sku, l.name AS location_name
       FROM inventory_movements m
       INNER JOIN items i
         ON (i.business_id, i.id) = (m.business_id, m.item_id)
       INNER JOIN business_locations l
         ON (l.business_id, l.id) = (m.business_id, m.location_id)
       WHERE m.business_id = $1
       ORDER BY m.created_at DESC, m.id DESC
       LIMIT 10`,
      [businessId]
    ),
    pool.query(
      `SELECT COUNT(*)::INTEGER AS completed_sales,
              COALESCE(SUM(total), 0)::NUMERIC(18,2) AS revenue,
              COALESCE(SUM(inventory_cost_snapshot), 0)::NUMERIC(18,4) AS inventory_cost
       FROM sales
       WHERE business_id = $1
         AND status = 'completed'
         AND created_at >= CURRENT_DATE - INTERVAL '30 days'`,
      [businessId]
    )
  ]);

  return {
    summary: summaryResult.rows[0],
    products: productsResult.rows,
    recentMovements: movementsResult.rows,
    salesLast30Days: salesResult.rows[0]
  };
}
