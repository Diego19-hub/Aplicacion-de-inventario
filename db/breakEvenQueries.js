import pool from "./pool.js";

export async function getBreakEvenCosts({ businessId, monthStart, monthEnd }) {
  const result = await pool.query(
    `SELECT
       id, name, amount, cost_type, frequency, category, start_date, end_date, created_at,
       CASE
         WHEN frequency = 'weekly' THEN amount * 52 / 12
         WHEN frequency = 'monthly' THEN amount
         WHEN frequency = 'yearly' THEN amount / 12
         WHEN frequency = 'one_time' THEN amount
       END AS applied_amount
     FROM business_costs
     WHERE business_id = $1
       AND is_active = true
       AND start_date < $3::date
       AND (end_date IS NULL OR end_date >= $2::date)
       AND (
         frequency IN ('weekly', 'monthly', 'yearly')
         OR (frequency = 'one_time' AND created_at >= $2::timestamptz AND created_at < $3::timestamptz)
       )
     ORDER BY LOWER(name), id`,
    [businessId, monthStart, monthEnd]
  );
  return result.rows;
}

export async function getBreakEvenSales({ businessId, monthStart, monthEnd }) {
  const result = await pool.query(
    `WITH monthly_sales AS (
       SELECT id, business_id, total, inventory_cost_snapshot, valuation_method_snapshot
       FROM sales
       WHERE business_id = $1
         AND status = 'completed'
         AND created_at >= $2::timestamptz
         AND created_at < $3::timestamptz
     ), sale_line_costs AS (
       SELECT
         si.business_id,
         si.sale_id,
         COALESCE(SUM(si.quantity), 0)::NUMERIC AS units_sold,
         COALESCE(SUM(CASE WHEN si.unit_cost IS NOT NULL THEN si.unit_cost * si.quantity ELSE 0 END), 0)::NUMERIC AS average_variable_cost,
         COUNT(si.id) FILTER (WHERE si.unit_cost IS NULL)::INTEGER AS missing_cost_lines
       FROM sale_items si
       INNER JOIN monthly_sales s
         ON (s.business_id, s.id) = (si.business_id, si.sale_id)
       GROUP BY si.business_id, si.sale_id
     )
     SELECT
       (SELECT COUNT(*) FROM monthly_sales)::INTEGER AS sales_count,
       COALESCE(SUM(line.units_sold), 0)::NUMERIC AS units_sold,
       (SELECT COALESCE(SUM(total), 0) FROM monthly_sales)::NUMERIC AS revenue,
       COALESCE(SUM(CASE
         WHEN s.valuation_method_snapshot = 'fifo' THEN s.inventory_cost_snapshot
         ELSE line.average_variable_cost
       END), 0)::NUMERIC AS variable_costs,
       COALESCE(SUM(CASE
         WHEN s.valuation_method_snapshot = 'fifo' AND s.inventory_cost_snapshot IS NULL THEN line.missing_cost_lines
         WHEN s.valuation_method_snapshot <> 'fifo' OR s.valuation_method_snapshot IS NULL THEN line.missing_cost_lines
         ELSE 0
       END), 0)::INTEGER AS missing_cost_lines,
       COUNT(*) FILTER (WHERE (s.valuation_method_snapshot = 'fifo' AND s.inventory_cost_snapshot IS NULL) OR ((s.valuation_method_snapshot <> 'fifo' OR s.valuation_method_snapshot IS NULL) AND line.missing_cost_lines > 0))::INTEGER AS missing_cost_sales
     FROM monthly_sales s
     LEFT JOIN sale_line_costs line
       ON (line.business_id, line.sale_id) = (s.business_id, s.id)
     `,
    [businessId, monthStart, monthEnd]
  );
  return result.rows[0];
}
