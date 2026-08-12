import pool from "./pool.js";

export async function getActiveBusinessesForUser(userId) {
  const result = await pool.query(
    `
      SELECT
        businesses.id,
        businesses.name,
        businesses.slug,
        businesses.currency,
        businesses.timezone,
        business_members.role,
        business_members.status AS membership_status
      FROM business_members
      INNER JOIN businesses
        ON businesses.id = business_members.business_id
      WHERE business_members.user_id = $1
        AND business_members.status = 'active'
        AND businesses.status = 'active'
      ORDER BY businesses.name
    `,
    [userId]
  );

  return result.rows;
}

export async function getActiveBusinessMembership(userId, businessId) {
  const result = await pool.query(
    `
      SELECT
        businesses.id,
        businesses.name,
        businesses.slug,
        businesses.currency,
        businesses.timezone,
        businesses.status,
        business_members.id AS membership_id,
        business_members.role,
        business_members.status AS membership_status
      FROM business_members
      INNER JOIN businesses
        ON businesses.id = business_members.business_id
      WHERE business_members.user_id = $1
        AND business_members.business_id = $2
        AND business_members.status = 'active'
        AND businesses.status = 'active'
    `,
    [userId, businessId]
  );

  return result.rows[0];
}
