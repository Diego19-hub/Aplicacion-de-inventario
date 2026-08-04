import pool from "./pool.js";

export async function getInventorySummary(businessId) {
  const result = await pool.query(
    `
      SELECT
        (SELECT COUNT(*) FROM categories WHERE business_id = $1)::INTEGER AS category_count,
        COUNT(items.id)::INTEGER AS item_count,
        COALESCE(SUM(items.stock), 0)::INTEGER AS total_stock,
        COALESCE(SUM(items.price * items.stock), 0) AS inventory_value
      FROM items
      WHERE items.business_id = $1
    `,
    [businessId]
  );

  return result.rows[0];
}

export async function getAllCategories(businessId) {
  const result = await pool.query(
    `
      SELECT
        categories.id,
        categories.name,
        categories.description,
        COUNT(items.id)::INTEGER AS item_count
      FROM categories
      LEFT JOIN items
        ON items.category_id = categories.id
       AND items.business_id = categories.business_id
      WHERE categories.business_id = $1
      GROUP BY categories.id, categories.name, categories.description
      ORDER BY categories.name
    `,
    [businessId]
  );

  return result.rows;
}

export async function getCategoryById(id, businessId) {
  const result = await pool.query(
    `
      SELECT
        categories.id,
        categories.name,
        categories.description,
        categories.created_at,
        COUNT(items.id)::INTEGER AS item_count
      FROM categories
      LEFT JOIN items
        ON items.category_id = categories.id
       AND items.business_id = categories.business_id
      WHERE categories.id = $1
        AND categories.business_id = $2
      GROUP BY categories.id, categories.name, categories.description, categories.created_at
    `,
    [id, businessId]
  );

  return result.rows[0];
}

export async function getItemsByCategoryId(categoryId, businessId) {
  const result = await pool.query(
    `
      SELECT id, name, description, brand, price, stock
      FROM items
      WHERE category_id = $1
        AND business_id = $2
      ORDER BY name
    `,
    [categoryId, businessId]
  );

  return result.rows;
}

export async function createCategory(name, description, businessId) {
  const result = await pool.query(
    `
      INSERT INTO categories (name, description, business_id)
      VALUES ($1, $2, $3)
      RETURNING id, name, description, created_at
    `,
    [name, description, businessId]
  );

  return result.rows[0];
}

export async function updateCategory(id, businessId, name, description) {
  const result = await pool.query(
    `
      UPDATE categories
      SET name = $1, description = $2
      WHERE id = $3
        AND business_id = $4
      RETURNING id, name, description, created_at
    `,
    [name, description, id, businessId]
  );

  return result.rows[0];
}

export async function deleteCategory(id, businessId) {
  const result = await pool.query(
    `
      DELETE FROM categories
      WHERE id = $1
        AND business_id = $2
      RETURNING id, name
    `,
    [id, businessId]
  );

  return result.rows[0];
}

export async function getAllItems(businessId) {
  const result = await pool.query(
    `
      SELECT
        items.id, items.name, items.description, items.brand,
        items.price, items.stock, items.category_id,
        categories.name AS category_name
      FROM items
      INNER JOIN categories
        ON categories.id = items.category_id
       AND categories.business_id = items.business_id
      WHERE items.business_id = $1
      ORDER BY items.name
    `,
    [businessId]
  );

  return result.rows;
}

export async function getItemById(id, businessId) {
  const result = await pool.query(
    `
      SELECT
        items.id, items.name, items.description, items.brand,
        items.price, items.stock, items.category_id, items.created_at,
        categories.name AS category_name
      FROM items
      INNER JOIN categories
        ON categories.id = items.category_id
       AND categories.business_id = items.business_id
      WHERE items.id = $1
        AND items.business_id = $2
    `,
    [id, businessId]
  );

  return result.rows[0];
}

export async function createItem(
  { name, description, brand, price, stock, categoryId },
  businessId
) {
  const result = await pool.query(
    `
      INSERT INTO items (
        name, description, brand, price, stock, category_id, business_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id
    `,
    [name, description, brand, price, stock, categoryId, businessId]
  );

  return result.rows[0];
}

export async function updateItem(
  id,
  businessId,
  { name, description, brand, price, stock, categoryId }
) {
  const result = await pool.query(
    `
      UPDATE items
      SET
        name = $1,
        description = $2,
        brand = $3,
        price = $4,
        stock = $5,
        category_id = $6
      WHERE id = $7
        AND business_id = $8
      RETURNING id
    `,
    [name, description, brand, price, stock, categoryId, id, businessId]
  );

  return result.rows[0];
}

export async function deleteItem(id, businessId) {
  const result = await pool.query(
    `
      DELETE FROM items
      WHERE id = $1
        AND business_id = $2
      RETURNING id, name, category_id
    `,
    [id, businessId]
  );

  return result.rows[0];
}
