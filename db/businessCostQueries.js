import pool from "./pool.js";

export async function getBusinessCosts(businessId) {
  const result = await pool.query(
    `SELECT
       c.id, c.name, c.description, c.amount, c.cost_type, c.frequency,
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

export async function createBusinessCost({ businessId, createdBy, name, description, amount, costType, frequency }) {
  const result = await pool.query(
    `INSERT INTO business_costs
       (business_id, name, description, amount, cost_type, frequency, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, name, description, amount, cost_type, frequency, is_active,
               created_by, created_at, updated_at`,
    [businessId, name, description || null, amount, costType, frequency, createdBy]
  );
  return result.rows[0];
}

export async function updateBusinessCost({ businessId, costId, name, description, amount, costType, frequency }) {
  const result = await pool.query(
    `UPDATE business_costs
     SET name = $1,
         description = $2,
         amount = $3,
         cost_type = $4,
         frequency = $5
     WHERE business_id = $6
       AND id = $7
       AND is_active = true
     RETURNING id, name, description, amount, cost_type, frequency, is_active,
               created_by, created_at, updated_at`,
    [name, description || null, amount, costType, frequency, businessId, costId]
  );
  return result.rows[0] ?? null;
}

export async function updateBusinessCostStatus({ businessId, costId, isActive }) {
  const result = await pool.query(
    `UPDATE business_costs
     SET is_active = $1
     WHERE business_id = $2
       AND id = $3
     RETURNING id, name, description, amount, cost_type, frequency, is_active,
               created_by, created_at, updated_at`,
    [isActive, businessId, costId]
  );
  return result.rows[0] ?? null;
}
