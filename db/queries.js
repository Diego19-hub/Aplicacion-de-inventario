import pool from "./pool.js";
import { auditService } from "../services/auditService.js";
import { categorySkuPrefix } from "../utils/sku.js";

export async function getInventorySummary(businessId) {
  const result = await pool.query(
  `
    SELECT
      (
        SELECT COUNT(*)
        FROM inventory_stock_thresholds thresholds
        JOIN items alert_items
          ON alert_items.business_id = thresholds.business_id
        AND alert_items.id = thresholds.item_id
        JOIN business_locations locations
          ON locations.business_id = thresholds.business_id
        AND locations.id = thresholds.location_id
        LEFT JOIN inventory_balances balances
          ON balances.business_id = thresholds.business_id
        AND balances.item_id = thresholds.item_id
        AND balances.location_id = thresholds.location_id
        WHERE thresholds.business_id = $1
          AND alert_items.status = 'active'
          AND locations.status = 'active'
          AND COALESCE(balances.stock, 0) <= thresholds.minimum_stock
      )::INTEGER AS stock_alert_count,

      (
        SELECT COUNT(*)
        FROM categories
        WHERE business_id = $1
      )::INTEGER AS category_count,

      COUNT(items.id)::INTEGER AS item_count,
      COALESCE(SUM(items.stock), 0)::INTEGER AS total_stock,
      COALESCE(SUM(items.price * items.stock), 0) AS inventory_value
    FROM items
    WHERE items.business_id = $1
      AND items.status = 'active'
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
        categories.is_default,
        COUNT(items.id)::INTEGER AS item_count
      FROM categories
      LEFT JOIN items
        ON items.category_id = categories.id
       AND items.business_id = categories.business_id
       AND items.status = 'active'
      WHERE categories.business_id = $1
      GROUP BY categories.id, categories.name, categories.description, categories.is_default
      ORDER BY categories.is_default DESC, LOWER(categories.name), categories.id
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
       AND items.status = 'active'
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
      SELECT id, sku, name, description, brand, price, stock
      FROM items
      WHERE category_id = $1
        AND business_id = $2
        AND status = 'active'
      ORDER BY LOWER(name), id
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
        AND is_default = false
      RETURNING id, name
    `,
    [id, businessId]
  );

  return result.rows[0];
}

function itemListFilters({ businessId, query, categoryId }) {
  const values = [businessId];
  const filters = ["items.business_id = $1", "items.status = 'active'"];

  if (query) {
    values.push(`%${query}%`);
    filters.push(`(items.name ILIKE $${values.length} OR items.sku ILIKE $${values.length} OR items.barcode ILIKE $${values.length})`);
  }

  if (categoryId !== null) {
    values.push(categoryId);
    filters.push(`items.category_id = $${values.length}`);
  }

  return { values, where: filters.join(" AND ") };
}

export async function getPaginatedItems({ businessId, query, categoryId, limit, offset }) {
  const { values, where } = itemListFilters({ businessId, query, categoryId });
  values.push(limit, offset);
  const result = await pool.query(
    `
      SELECT
        items.id, items.sku, items.barcode, items.name, items.description, items.brand,
        items.price, items.stock, items.category_id,
        categories.name AS category_name
      FROM items
      INNER JOIN categories
        ON categories.id = items.category_id
       AND categories.business_id = items.business_id
      WHERE ${where}
      ORDER BY LOWER(items.name), items.id
      LIMIT $${values.length - 1} OFFSET $${values.length}
    `,
    values
  );

  return result.rows;
}

export async function countFilteredItems({ businessId, query, categoryId }) {
  const { values, where } = itemListFilters({ businessId, query, categoryId });
  const result = await pool.query(
    `SELECT COUNT(*)::INTEGER AS count FROM items WHERE ${where}`,
    values
  );
  return result.rows[0].count;
}

export async function getItemById(id, businessId) {
  const result = await pool.query(
    `
      SELECT
        items.id, items.sku, items.barcode, items.name, items.description, items.brand,
        items.price, items.cost_price, items.stock, items.category_id, items.created_at,
        categories.name AS category_name
      FROM items
      INNER JOIN categories
        ON categories.id = items.category_id
       AND categories.business_id = items.business_id
      WHERE items.id = $1
        AND items.business_id = $2
        AND items.status = 'active'
    `,
    [id, businessId]
  );

  return result.rows[0];
}

export async function createItem(
  { sku, barcode, name, description, brand, price, costPrice, categoryId },
  businessId,
  createdBy = null
) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const categoryResult = await client.query(
      `SELECT id, name FROM categories
       WHERE business_id = $1
         AND (
           ($2::integer IS NULL AND is_default)
           OR id = $2
         )
       FOR KEY SHARE`,
      [businessId, categoryId ?? null]
    );
    const category = categoryResult.rows[0];
    if (!category) {
      await client.query("ROLLBACK");
      return null;
    }

    let resolvedSku = sku;
    if (!resolvedSku) {
      const prefix = categorySkuPrefix(category.name);
      const pattern = `^${prefix}-([0-9]+)$`;
      await client.query(
        "SELECT pg_advisory_xact_lock($1, hashtext($2))",
        [businessId, prefix]
      );
      const sequenceResult = await client.query(
        `SELECT COALESCE(MAX((substring(sku FROM $2))::BIGINT), 0) + 1 AS next_number
         FROM items
         WHERE business_id = $1 AND sku ~ $2`,
        [businessId, pattern]
      );
      resolvedSku = `${prefix}-${String(sequenceResult.rows[0].next_number).padStart(4, "0")}`;
    }

    const result = await client.query(
      `INSERT INTO items (
        sku, barcode, name, description, brand, price, cost_price, stock, category_id, business_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id, sku, barcode, name, description, brand, price, cost_price, stock, category_id`,
      [resolvedSku, barcode || null, name, description, brand, price, costPrice ?? null, 0, category.id, businessId]
    );
    await auditService.record({ client, businessId, userId: createdBy, module: "products", action: "create", reference: `PRODUCT-${result.rows[0].id}`, description: "Producto creado", newValues: { ...result.rows[0], category_name: category.name } });
    await client.query("COMMIT");
    return { ...result.rows[0], category_name: category.name };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function updateItem(
  id,
  businessId,
  { sku, barcode, name, description, brand, price, costPrice, categoryId },
  userId = null
) {
  const client = await pool.connect();
  const hasCostPrice = costPrice !== undefined;
  try {
  await client.query("BEGIN");
  const result = await client.query(
    `
      WITH resolved_category AS (
        SELECT id
        FROM categories
        WHERE business_id = $10
          AND (
            ($8::integer IS NULL AND is_default)
            OR id = $8
          )
      )
      UPDATE items
      SET
        sku = $1,
        barcode = $2,
        name = $3,
        description = $4,
        brand = $5,
        price = $6,
        cost_price = CASE WHEN $11::BOOLEAN THEN $7::NUMERIC ELSE items.cost_price END,
        category_id = resolved_category.id
      FROM resolved_category
      WHERE items.id = $9
        AND items.business_id = $10
        AND items.status = 'active'
      RETURNING items.id, items.sku, items.barcode, items.name, items.description, items.brand, items.price, items.cost_price, items.stock, items.category_id
    `,
    [sku, barcode || null, name, description, brand, price, costPrice ?? null, categoryId ?? null, id, businessId, hasCostPrice]
  );

  if (!result.rows[0]) { await client.query("ROLLBACK"); return undefined; }
  await auditService.record({ client, businessId, userId, module: "products", action: "edit", reference: `PRODUCT-${id}`, description: "Producto editado", newValues: { id, sku, barcode, name, description, brand, price, costPrice, categoryId } });
  await client.query("COMMIT");
  return result.rows[0];
  } catch (error) { await client.query("ROLLBACK").catch(() => {}); throw error; } finally { client.release(); }
}

export async function archiveItem(id, businessId, archivedBy, archiveReason) {
  const client = await pool.connect();
  try {
  await client.query("BEGIN");
  const result = await client.query(
    `
      UPDATE items
      SET
        status = 'archived',
        archived_at = CURRENT_TIMESTAMP,
        archived_by = $3,
        archive_reason = $4
      WHERE id = $1
        AND business_id = $2
        AND status = 'active'
      RETURNING id, status, archived_at
    `,
    [id, businessId, archivedBy, archiveReason]
  );

  if (!result.rows[0]) { await client.query("ROLLBACK"); return undefined; }
  await auditService.record({ client, businessId, userId: archivedBy, module: "products", action: "change_status", reference: `PRODUCT-${id}`, description: "Producto archivado", newValues: { id, status: "archived", reason: archiveReason } });
  await client.query("COMMIT");
  return result.rows[0];
  } catch (error) { await client.query("ROLLBACK").catch(() => {}); throw error; } finally { client.release(); }
}

export async function getArchivedItems(businessId) {
  const result = await pool.query(
    `
      SELECT
        items.id, items.name, items.sku, items.category_id,
        items.archived_at, items.archive_reason,
        categories.name AS category_name,
        users.username AS archived_by_username
      FROM items
      INNER JOIN categories
        ON categories.id = items.category_id
       AND categories.business_id = items.business_id
      INNER JOIN users ON users.id = items.archived_by
      WHERE items.business_id = $1
        AND items.status = 'archived'
      ORDER BY items.archived_at DESC, items.id DESC
    `,
    [businessId]
  );
  return result.rows;
}

export async function getArchivedItemById(id, businessId) {
  const result = await pool.query(
    `
      SELECT
        items.id, items.sku, items.name, items.description, items.brand,
        items.price, items.stock, items.category_id, items.created_at,
        items.archived_at, items.archive_reason,
        categories.name AS category_name,
        users.username AS archived_by_username
      FROM items
      INNER JOIN categories
        ON categories.id = items.category_id
       AND categories.business_id = items.business_id
      INNER JOIN users ON users.id = items.archived_by
      WHERE items.id = $1
        AND items.business_id = $2
        AND items.status = 'archived'
    `,
    [id, businessId]
  );
  return result.rows[0];
}

export async function restoreItem(id, businessId, restoredBy = null) {
  const client = await pool.connect();
  try {
  await client.query("BEGIN");
  const result = await client.query(
    `
      UPDATE items
      SET
        status = 'active',
        archived_at = NULL,
        archived_by = NULL,
        archive_reason = NULL
      WHERE id = $1
        AND business_id = $2
        AND status = 'archived'
      RETURNING id
    `,
    [id, businessId]
  );
  if (!result.rows[0]) { await client.query("ROLLBACK"); return undefined; }
  await auditService.record({ client, businessId, userId: restoredBy, module: "products", action: "change_status", reference: `PRODUCT-${id}`, description: "Producto restaurado", newValues: { id, status: "active" } });
  await client.query("COMMIT");
  return result.rows[0];
  } catch (error) { await client.query("ROLLBACK").catch(() => {}); throw error; } finally { client.release(); }
}
