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

export async function getApiProductCategories(businessId) {
  const result = await pool.query(
    "SELECT id, name FROM categories WHERE business_id = $1 ORDER BY LOWER(name), id",
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
