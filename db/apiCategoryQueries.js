import pool from "./pool.js";

function categoryFilters({ businessId, query }) {
  const values = [businessId];
  const where = ["c.business_id = $1"];

  if (query) {
    values.push(`%${query}%`);
    where.push(`c.name ILIKE $${values.length}`);
  }

  return { values, where: where.join(" AND ") };
}

const categoryMetrics = `
  COUNT(i.id) FILTER (WHERE i.status = 'active')::INTEGER AS active_product_count,
  COUNT(i.id) FILTER (WHERE i.status = 'archived')::INTEGER AS archived_product_count,
  COALESCE(SUM(i.stock) FILTER (WHERE i.status = 'active'), 0)::INTEGER AS total_stock
`;

export async function countApiCategories(filters) {
  const { values, where } = categoryFilters(filters);
  const result = await pool.query(
    `SELECT COUNT(*)::INTEGER AS count FROM categories c WHERE ${where}`,
    values
  );
  return result.rows[0].count;
}

export async function getApiCategories({ limit, offset, ...filters }) {
  const { values, where } = categoryFilters(filters);
  values.push(limit, offset);
  const result = await pool.query(
    `
      SELECT
        c.id, c.name, c.description,
        ${categoryMetrics}
      FROM categories c
      LEFT JOIN items i
        ON (i.business_id, i.category_id) = (c.business_id, c.id)
      WHERE ${where}
      GROUP BY c.id, c.name, c.description
      ORDER BY LOWER(c.name), c.id
      LIMIT $${values.length - 1} OFFSET $${values.length}
    `,
    values
  );
  return result.rows;
}

export async function getApiCategoryById(businessId, categoryId) {
  const result = await pool.query(
    `
      SELECT
        c.id, c.name, c.description,
        ${categoryMetrics}
      FROM categories c
      LEFT JOIN items i
        ON (i.business_id, i.category_id) = (c.business_id, c.id)
      WHERE c.business_id = $1
        AND c.id = $2
      GROUP BY c.id, c.name, c.description
    `,
    [businessId, categoryId]
  );
  return result.rows[0] ?? null;
}

export async function getApiActiveCategoryProducts(businessId, categoryId) {
  const result = await pool.query(
    `
      SELECT id, name, sku, brand, price, stock
      FROM items
      WHERE business_id = $1
        AND category_id = $2
        AND status = 'active'
      ORDER BY LOWER(name), id
    `,
    [businessId, categoryId]
  );
  return result.rows;
}

export async function createApiCategory(businessId, { name, description }) {
  const result = await pool.query(
    `
      INSERT INTO categories (name, description, business_id)
      VALUES ($1, $2, $3)
      RETURNING id, name, description
    `,
    [name, description, businessId]
  );
  return result.rows[0];
}

export async function updateApiCategory(businessId, categoryId, { name, description }) {
  const result = await pool.query(
    `
      UPDATE categories
      SET name = $1, description = $2
      WHERE business_id = $3
        AND id = $4
      RETURNING id, name, description
    `,
    [name, description, businessId, categoryId]
  );
  return result.rows[0] ?? null;
}

export async function deleteApiCategory(businessId, categoryId) {
  const result = await pool.query(
    `
      DELETE FROM categories
      WHERE business_id = $1
        AND id = $2
      RETURNING id
    `,
    [businessId, categoryId]
  );
  return result.rows[0] ?? null;
}
