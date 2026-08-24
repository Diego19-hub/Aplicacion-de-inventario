import pool from "./pool.js";

export async function getBreakEvenCosts({ businessId, monthStart, monthEnd }) {
  const result = await pool.query(
    `SELECT
       id, name, amount, cost_type, frequency, created_at,
       CASE
         WHEN frequency = 'monthly' THEN amount
         WHEN frequency = 'yearly' THEN amount / 12
         WHEN frequency = 'one_time' THEN amount
       END AS applied_amount
     FROM business_costs
     WHERE business_id = $1
       AND is_active = true
       AND created_at < $3::timestamptz
       AND (
         frequency IN ('monthly', 'yearly')
         OR (frequency = 'one_time' AND created_at >= $2::timestamptz AND created_at < $3::timestamptz)
       )
       AND cost_type = 'fixed'
     ORDER BY LOWER(name), id`,
    [businessId, monthStart, monthEnd]
  );
  return result.rows;
}

export async function getBreakEvenSales({ businessId, monthStart, monthEnd }) {
  const result = await pool.query(
    `WITH monthly_sales AS (
       SELECT id, business_id, total
       FROM sales
       WHERE business_id = $1
         AND status = 'completed'
         AND created_at >= $2::timestamptz
         AND created_at < $3::timestamptz
     )
     SELECT
       (SELECT COUNT(*) FROM monthly_sales)::INTEGER AS sales_count,
       COALESCE(SUM(si.quantity), 0)::NUMERIC AS units_sold,
       (SELECT COALESCE(SUM(total), 0) FROM monthly_sales)::NUMERIC AS revenue,
       COALESCE(SUM(CASE WHEN si.unit_cost IS NOT NULL THEN si.unit_cost * si.quantity ELSE 0 END), 0)::NUMERIC AS variable_costs,
       COUNT(si.id) FILTER (WHERE si.unit_cost IS NULL)::INTEGER AS missing_cost_lines,
       COUNT(DISTINCT s.id) FILTER (WHERE si.unit_cost IS NULL)::INTEGER AS missing_cost_sales
     FROM monthly_sales s
     LEFT JOIN sale_items si
       ON (si.business_id, si.sale_id) = (s.business_id, s.id)
     `,
    [businessId, monthStart, monthEnd]
  );
  return result.rows[0];
}
