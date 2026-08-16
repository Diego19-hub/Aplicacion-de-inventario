import pool from "./pool.js";

function productFilters({ businessId, query, categoryId }) {
  const values = [businessId];
  const where = ["i.business_id = $1", "i.status = 'active'"];

  if (query) {
    values.push(`%${query}%`);
    where.push(`(i.name ILIKE $${values.length} OR i.sku ILIKE $${values.length})`);
  }

  if (categoryId !== null) {
    values.push(categoryId);
    where.push(`i.category_id = $${values.length}`);
  }

  return { values, where: where.join(" AND ") };
}

function archivedProductFilters({ businessId, query, categoryId }) {
  const values = [businessId];
  const where = ["i.business_id = $1", "i.status = 'archived'"];

  if (query) {
    values.push(`%${query}%`);
    where.push(`(i.name ILIKE $${values.length} OR i.sku ILIKE $${values.length})`);
  }

  if (categoryId !== null) {
    values.push(categoryId);
    where.push(`i.category_id = $${values.length}`);
  }

  return { values, where: where.join(" AND ") };
}

export async function getApiProductCategories(businessId) {
  const result = await pool.query(
    "SELECT id, name, is_default FROM categories WHERE business_id = $1 ORDER BY is_default DESC, LOWER(name), id",
    [businessId]
  );
  return result.rows;
}

export async function countApiProducts(filters) {
  const { values, where } = productFilters(filters);
  const result = await pool.query(
    `SELECT COUNT(*)::INTEGER AS count FROM items i WHERE ${where}`,
    values
  );
  return result.rows[0].count;
}

export async function getApiProducts({ limit, offset, ...filters }) {
  const { values, where } = productFilters(filters);
  values.push(limit, offset);
  const result = await pool.query(
    `
      SELECT
        i.id,
        i.name,
        i.sku,
        i.brand,
        i.price,
        i.stock,
        c.id AS category_id,
        c.name AS category_name
      FROM items i
      INNER JOIN categories c
        ON (c.business_id, c.id) = (i.business_id, i.category_id)
      WHERE ${where}
      ORDER BY LOWER(i.name), i.id
      LIMIT $${values.length - 1} OFFSET $${values.length}
    `,
    values
  );
  return result.rows;
}

export async function countApiArchivedProducts(filters) {
  const { values, where } = archivedProductFilters(filters);
  const result = await pool.query(
    `SELECT COUNT(*)::INTEGER AS count FROM items i WHERE ${where}`,
    values
  );
  return result.rows[0].count;
}

export async function getApiArchivedProducts({ limit, offset, ...filters }) {
  const { values, where } = archivedProductFilters(filters);
  values.push(limit, offset);
  const result = await pool.query(
    `
      SELECT i.id, i.name, i.sku, i.brand, i.stock, i.archived_at, i.archive_reason,
             c.id AS category_id, c.name AS category_name
      FROM items i
      INNER JOIN categories c ON (c.business_id, c.id) = (i.business_id, i.category_id)
      WHERE ${where}
      ORDER BY i.archived_at DESC, i.id DESC
      LIMIT $${values.length - 1} OFFSET $${values.length}
    `,
    values
  );
  return result.rows;
}

export async function getApiProductById(businessId, productId) {
  const result = await pool.query(
    `
      SELECT
        i.id, i.name, i.sku, i.description, i.brand, i.price, i.stock, i.created_at,
        c.id AS category_id, c.name AS category_name
      FROM items i
      INNER JOIN categories c
        ON (c.business_id, c.id) = (i.business_id, i.category_id)
      WHERE i.business_id = $1
        AND i.id = $2
        AND i.status = 'active'
    `,
    [businessId, productId]
  );
  return result.rows[0] ?? null;
}

export async function getApiArchivedProductById(businessId, productId) {
  const result = await pool.query(
    `
      SELECT i.id, i.name, i.sku, i.description, i.brand, i.price, i.stock, i.created_at,
             i.archived_at, i.archive_reason, u.username AS archived_by_username,
             c.id AS category_id, c.name AS category_name
      FROM items i
      INNER JOIN categories c ON (c.business_id, c.id) = (i.business_id, i.category_id)
      LEFT JOIN users u ON u.id = i.archived_by
      WHERE i.business_id = $1 AND i.id = $2 AND i.status = 'archived'
    `,
    [businessId, productId]
  );
  return result.rows[0] ?? null;
}

export async function getApiProductBalances(businessId, productId) {
  const result = await pool.query(
    `
      SELECT
        l.id AS location_id, l.name AS location_name, l.code AS location_code,
        l.status AS location_status, l.is_default,
        COALESCE(b.stock, 0)::INTEGER AS stock,
        t.minimum_stock
      FROM business_locations l
      LEFT JOIN inventory_balances b
        ON (b.business_id, b.location_id, b.item_id) = (l.business_id, l.id, $2)
      LEFT JOIN inventory_stock_thresholds t
        ON (t.business_id, t.location_id, t.item_id) = (l.business_id, l.id, $2)
      WHERE l.business_id = $1
        AND (l.status = 'active' OR COALESCE(b.stock, 0) > 0)
      ORDER BY l.is_default DESC, LOWER(l.name), l.id
    `,
    [businessId, productId]
  );
  return result.rows;
}

export async function getApiProductRecentMovements(businessId, productId) {
  const result = await pool.query(
    `
      SELECT
        m.id, m.created_at, m.movement_type, m.quantity_delta,
        m.previous_stock, m.resulting_stock, m.reason, m.reference, m.transfer_id,
        l.id AS location_id, l.name AS location_name, l.code AS location_code,
        u.id AS created_by_id, u.username
      FROM inventory_movements m
      INNER JOIN business_locations l
        ON (l.business_id, l.id) = (m.business_id, m.location_id)
      INNER JOIN users u
        ON u.id = m.created_by
      WHERE m.business_id = $1
        AND m.item_id = $2
      ORDER BY m.created_at DESC, m.id DESC
      LIMIT 5
    `,
    [businessId, productId]
  );
  return result.rows;
}
