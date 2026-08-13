import pool from "./pool.js";

function locationFilters({ businessId, query, status }) {
  const values = [businessId];
  const where = ["l.business_id = $1"];

  if (query) {
    values.push(`%${query}%`);
    where.push(`(l.name ILIKE $${values.length} OR l.code ILIKE $${values.length})`);
  }

  if (status !== "all") {
    values.push(status);
    where.push(`l.status = $${values.length}`);
  }

  return { values, where: where.join(" AND ") };
}

const locationMetrics = `
  WITH location_metrics AS (
    SELECT
      b.business_id,
      b.location_id,
      COALESCE(SUM(b.stock), 0)::INTEGER AS total_stock,
      COUNT(*) FILTER (WHERE b.stock > 0)::INTEGER AS positive_product_count
    FROM inventory_balances b
    WHERE b.business_id = $1
    GROUP BY b.business_id, b.location_id
  )
`;

export async function countApiLocations(filters) {
  const { values, where } = locationFilters(filters);
  const result = await pool.query(
    `SELECT COUNT(*)::INTEGER AS count FROM business_locations l WHERE ${where}`,
    values
  );
  return result.rows[0].count;
}

export async function getApiLocations({ limit, offset, ...filters }) {
  const { values, where } = locationFilters(filters);
  values.push(limit, offset);
  const result = await pool.query(
    `
      ${locationMetrics}
      SELECT
        l.id, l.name, l.code, l.location_type, l.status, l.is_default,
        l.address, l.phone,
        COALESCE(metrics.total_stock, 0)::INTEGER AS total_stock,
        COALESCE(metrics.positive_product_count, 0)::INTEGER AS positive_product_count
      FROM business_locations l
      LEFT JOIN location_metrics metrics
        ON (metrics.business_id, metrics.location_id) = (l.business_id, l.id)
      WHERE ${where}
      ORDER BY l.is_default DESC, LOWER(l.name), l.id
      LIMIT $${values.length - 1} OFFSET $${values.length}
    `,
    values
  );
  return result.rows;
}

export async function getApiLocationById(businessId, locationId) {
  const result = await pool.query(
    `
      ${locationMetrics}
      SELECT
        l.id, l.name, l.code, l.location_type, l.status, l.is_default,
        l.address, l.phone, l.notes,
        COALESCE(metrics.total_stock, 0)::INTEGER AS total_stock,
        COALESCE(metrics.positive_product_count, 0)::INTEGER AS positive_product_count
      FROM business_locations l
      LEFT JOIN location_metrics metrics
        ON (metrics.business_id, metrics.location_id) = (l.business_id, l.id)
      WHERE l.business_id = $1
        AND l.id = $2
    `,
    [businessId, locationId]
  );
  return result.rows[0] ?? null;
}

export async function getApiLocationProducts(businessId, locationId) {
  const result = await pool.query(
    `
      SELECT
        i.id, i.name, i.sku, i.status,
        b.stock AS local_stock,
        i.stock AS total_stock
      FROM inventory_balances b
      INNER JOIN items i
        ON (i.business_id, i.id) = (b.business_id, b.item_id)
      WHERE b.business_id = $1
        AND b.location_id = $2
        AND b.stock > 0
      ORDER BY LOWER(i.name), i.id
    `,
    [businessId, locationId]
  );
  return result.rows;
}

export async function getApiLocationRecentMovements(businessId, locationId) {
  const result = await pool.query(
    `
      SELECT
        m.id, m.created_at, m.movement_type, m.quantity_delta, m.transfer_id,
        i.id AS item_id, i.name AS item_name, i.sku,
        u.id AS created_by_id, u.username
      FROM inventory_movements m
      INNER JOIN items i
        ON (i.business_id, i.id) = (m.business_id, m.item_id)
      INNER JOIN users u
        ON u.id = m.created_by
      WHERE m.business_id = $1
        AND m.location_id = $2
      ORDER BY m.created_at DESC, m.id DESC
      LIMIT 5
    `,
    [businessId, locationId]
  );
  return result.rows;
}

export async function createApiLocation(businessId, data) {
  const result = await pool.query(
    `
      INSERT INTO business_locations (
        business_id, name, code, location_type, address, phone, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, name, code, location_type, status, is_default, address, phone, notes
    `,
    [
      businessId,
      data.name,
      data.code,
      data.locationType,
      data.address,
      data.phone,
      data.notes
    ]
  );
  return result.rows[0];
}

export async function updateApiLocation(businessId, locationId, data) {
  const result = await pool.query(
    `
      UPDATE business_locations
      SET
        name = $1,
        code = $2,
        location_type = $3,
        address = $4,
        phone = $5,
        notes = $6
      WHERE business_id = $7
        AND id = $8
      RETURNING id, name, code, location_type, status, is_default, address, phone, notes
    `,
    [
      data.name,
      data.code,
      data.locationType,
      data.address,
      data.phone,
      data.notes,
      businessId,
      locationId
    ]
  );
  return result.rows[0] ?? null;
}
