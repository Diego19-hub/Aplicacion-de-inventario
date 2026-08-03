import pool from "./pool.js";

export async function getInventorySummary() {
  const result = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM categories)::INTEGER AS category_count,
      COUNT(items.id)::INTEGER AS item_count,
      COALESCE(SUM(items.stock), 0)::INTEGER AS total_stock,
      COALESCE(SUM(items.price * items.stock), 0) AS inventory_value
    FROM items
  `);

  return result.rows[0];
}

export async function getAllCategories() {
  const result = await pool.query(`
    SELECT
      categories.id,
      categories.name,
      categories.description,
      COUNT(items.id)::INTEGER AS item_count
    FROM categories
    LEFT JOIN items
      ON items.category_id = categories.id
    GROUP BY categories.id
    ORDER BY categories.name
  `);

  return result.rows;
}

export async function getCategoryById(id) {
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
      WHERE categories.id = $1
      GROUP BY categories.id
    `,
    [id]
  );

  return result.rows[0];
}

export async function getItemsByCategoryId(categoryId) {
  const result = await pool.query(
    `
      SELECT
        id,
        name,
        description,
        brand,
        price,
        stock
      FROM items
      WHERE category_id = $1
      ORDER BY name
    `,
    [categoryId]
  );

  return result.rows;
}

export async function createCategory(name, description) {
  const result = await pool.query(
    `
      INSERT INTO categories (name, description)
      VALUES ($1, $2)
      RETURNING id, name, description, created_at
    `,
    [name, description]
  );

  return result.rows[0];
}

export async function updateCategory(id, name, description) {
  const result = await pool.query(
    `
      UPDATE categories
      SET
        name = $1,
        description = $2
      WHERE id = $3
      RETURNING id, name, description, created_at
    `,
    [name, description, id]
  );

  return result.rows[0];
}

export async function deleteCategory(id) {
  const result = await pool.query(
    `
      DELETE FROM categories
      WHERE id = $1
      RETURNING id, name
    `,
    [id]
  );

  return result.rows[0];
}

export async function getAllItems() {
  const result = await pool.query(`
    SELECT
      items.id,
      items.name,
      items.description,
      items.brand,
      items.price,
      items.stock,
      items.category_id,
      categories.name AS category_name
    FROM items
    INNER JOIN categories
      ON categories.id = items.category_id
    ORDER BY items.name
  `);

  return result.rows;
}

export async function getItemById(id) {
  const result = await pool.query(
    `
      SELECT
        items.id,
        items.name,
        items.description,
        items.brand,
        items.price,
        items.stock,
        items.category_id,
        items.created_at,
        categories.name AS category_name
      FROM items
      INNER JOIN categories
        ON categories.id = items.category_id
      WHERE items.id = $1
    `,
    [id]
  );

  return result.rows[0];
}

export async function createItem({
  name,
  description,
  brand,
  price,
  stock,
  categoryId
}) {
  const result = await pool.query(
    `
      INSERT INTO items (
        name,
        description,
        brand,
        price,
        stock,
        category_id
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
    `,
    [
      name,
      description,
      brand,
      price,
      stock,
      categoryId
    ]
  );

  return result.rows[0];
}

export async function updateItem(
  id,
  {
    name,
    description,
    brand,
    price,
    stock,
    categoryId
  }
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
      RETURNING id
    `,
    [
      name,
      description,
      brand,
      price,
      stock,
      categoryId,
      id
    ]
  );

  return result.rows[0];
}

export async function deleteItem(id) {
  const result = await pool.query(
    `
      DELETE FROM items
      WHERE id = $1
      RETURNING id, name, category_id
    `,
    [id]
  );

  return result.rows[0];
}