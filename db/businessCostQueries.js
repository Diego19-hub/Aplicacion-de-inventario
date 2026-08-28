import pool from "./pool.js";

export async function getBusinessCosts(businessId) {
  const result = await pool.query(
    `SELECT
       c.id, c.name, c.description, c.category, c.amount, c.cost_type, c.frequency,
       c.start_date, c.end_date, c.notes, c.custom_category_name,
       c.is_active, c.created_by, c.created_at, c.updated_at,
       u.username AS created_by_username
     FROM business_costs c
     INNER JOIN users u ON u.id = c.created_by
     WHERE c.business_id = $1
     ORDER BY c.is_active DESC, LOWER(c.name), c.id`,
    [businessId]
  );
  return result.rows;
}

export async function createBusinessCost({ businessId, createdBy, name, description, category, customCategoryName, amount, costType, frequency, startDate, endDate, notes }) {
  const result = await pool.query(
    `INSERT INTO business_costs
       (business_id, name, description, category, custom_category_name, amount, cost_type, frequency, start_date, end_date, notes, created_by)
     VALUES ($1, $2, $3, COALESCE($4, 'labor'), NULLIF($5, ''), $6, $7, $8, COALESCE($9::date, CURRENT_DATE), $10, $11, $12)
     RETURNING id, name, description, category, custom_category_name, amount, cost_type, frequency, start_date, end_date, notes, is_active,
               created_by, created_at, updated_at`,
    [businessId, name, description || null, category || null, customCategoryName || null, amount, costType, frequency, startDate || null, endDate || null, notes || null, createdBy]
  );
  return result.rows[0];
}

export async function updateBusinessCost({ businessId, costId, name, description, category, customCategoryName, amount, costType, frequency, startDate, endDate, notes }) {
  const result = await pool.query(
    `UPDATE business_costs
     SET name = $1,
         description = $2,
         category = COALESCE($3, category),
         custom_category_name = NULLIF($4, ''),
         amount = $5,
         cost_type = $6,
         frequency = $7,
         start_date = COALESCE($8::date, start_date),
         end_date = $9,
         notes = $10
     WHERE business_id = $11
       AND id = $12
       AND is_active = true
    RETURNING id, name, description, category, custom_category_name, amount, cost_type, frequency, start_date, end_date, notes, is_active,
               created_by, created_at, updated_at`,
    [name, description || null, category || null, customCategoryName || null, amount, costType, frequency, startDate || null, endDate || null, notes || null, businessId, costId]
  );
  return result.rows[0] ?? null;
}

export async function updateBusinessCostStatus({ businessId, costId, isActive }) {
  const result = await pool.query(
    `UPDATE business_costs
     SET is_active = $1
     WHERE business_id = $2
       AND id = $3
    RETURNING id, name, description, category, custom_category_name, amount, cost_type, frequency, start_date, end_date, notes, is_active,
               created_by, created_at, updated_at`,
    [isActive, businessId, costId]
  );
  return result.rows[0] ?? null;
}
