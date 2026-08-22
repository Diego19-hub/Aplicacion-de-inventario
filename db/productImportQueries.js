import pool from "./pool.js";

export async function findExistingProductSkus(businessId, skus) {
  if (skus.length === 0) return [];
  const result = await pool.query(
    "SELECT sku FROM items WHERE business_id = $1 AND lower(sku) = ANY($2::text[])",
    [businessId, skus.map((sku) => sku.toLowerCase())]
  );
  return result.rows.map((row) => row.sku.toLowerCase());
}

export async function findExistingProductBarcodes(businessId, barcodes) {
  if (barcodes.length === 0) return [];
  const result = await pool.query("SELECT barcode FROM items WHERE business_id = $1 AND barcode = ANY($2::text[])", [businessId, barcodes]);
  return result.rows.map((row) => row.barcode);
}

async function findOrCreateCategory(client, businessId, name) {
  if (!name) {
    const result = await client.query(
      "SELECT id FROM categories WHERE business_id = $1 AND is_default ORDER BY id LIMIT 1",
      [businessId]
    );
    if (!result.rows[0]) throw new Error("El negocio no tiene una categoría predeterminada.");
    return result.rows[0].id;
  }
  const existing = await client.query(
    "SELECT id FROM categories WHERE business_id = $1 AND lower(name) = lower($2) LIMIT 1",
    [businessId, name]
  );
  if (existing.rows[0]) return existing.rows[0].id;
  const created = await client.query(
    "INSERT INTO categories (business_id, name, description) VALUES ($1, $2, $3) RETURNING id",
    [businessId, name, "Categoría creada por importación de productos"]
  );
  return created.rows[0].id;
}

async function findLocation(client, businessId, value) {
  const result = await client.query(
    `SELECT id FROM business_locations
     WHERE business_id = $1 AND status = 'active'
       AND ($2 = '' OR lower(name) = lower($2) OR lower(code) = lower($2))
     ORDER BY is_default DESC, id LIMIT 1`,
    [businessId, value || ""]
  );
  return result.rows[0]?.id ?? null;
}

async function findOrCreateSupplier(client, businessId, name) {
  if (!name) return null;
  const existing = await client.query(
    "SELECT id FROM suppliers WHERE business_id = $1 AND lower(name) = lower($2) LIMIT 1",
    [businessId, name]
  );
  if (existing.rows[0]) return existing.rows[0].id;
  const created = await client.query(
    "INSERT INTO suppliers (business_id, name) VALUES ($1, $2) RETURNING id",
    [businessId, name]
  );
  return created.rows[0].id;
}

export async function importProducts(client, businessId, userId, products) {
  const created = [];
  const seen = new Set();
  for (const product of products) {
    const normalizedSku = product.sku.trim().toUpperCase();
    if (seen.has(normalizedSku)) throw Object.assign(new Error("El SKU está duplicado en la importación."), { code: "SKU_DUPLICATE" });
    seen.add(normalizedSku);

    const duplicate = await client.query(
      "SELECT id FROM items WHERE business_id = $1 AND lower(sku) = lower($2) LIMIT 1",
      [businessId, normalizedSku]
    );
    if (duplicate.rows[0]) throw Object.assign(new Error("El SKU ya existe."), { code: "SKU_ALREADY_EXISTS" });
    const barcode = typeof product.barcode === "string" && product.barcode !== "" ? product.barcode : null;
    if (barcode) {
      const barcodeDuplicate = await client.query("SELECT id FROM items WHERE business_id = $1 AND barcode = $2 LIMIT 1", [businessId, barcode]);
      if (barcodeDuplicate.rows[0]) throw Object.assign(new Error("El código de barras ya existe en este negocio."), { code: "BARCODE_ALREADY_EXISTS" });
    }

    const categoryId = await findOrCreateCategory(client, businessId, product.category);
    const locationId = await findLocation(client, businessId, product.location);
    if (!locationId) throw Object.assign(new Error("La ubicación no existe o está inactiva."), { code: "LOCATION_NOT_FOUND" });
    await findOrCreateSupplier(client, businessId, product.supplier);

    const itemResult = await client.query(
      `INSERT INTO items (business_id, sku, barcode, name, description, brand, price, stock, category_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active')
       RETURNING id, name, sku, barcode, stock`,
      [businessId, normalizedSku, barcode, product.name, product.description || "", product.brand || "Sin marca", product.price, product.stock, categoryId]
    );
    const item = itemResult.rows[0];

    await client.query(
      `INSERT INTO inventory_balances (business_id, location_id, item_id, stock)
       VALUES ($1, $2, $3, $4)`,
      [businessId, locationId, item.id, product.stock]
    );
    if (product.stock > 0) {
      await client.query(
        `INSERT INTO inventory_movements
          (business_id, location_id, item_id, movement_type, quantity_delta, previous_stock, resulting_stock, reason, created_by)
         VALUES ($1, $2, $3, 'opening_balance', $4, 0, $4, $5, $6)`,
        [businessId, locationId, item.id, product.stock, "Saldo inicial importado desde Excel", userId]
      );
    }
    if (product.minimumStock !== null) {
      await client.query(
        `INSERT INTO inventory_stock_thresholds (business_id, item_id, location_id, minimum_stock, created_by)
         VALUES ($1, $2, $3, $4, $5)`,
        [businessId, item.id, locationId, product.minimumStock, userId]
      );
    }
    created.push(item);
  }
  return created;
}
