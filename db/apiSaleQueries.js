import pool from "./pool.js";
import { auditService } from "../services/auditService.js";

const PAYMENT_METHODS = ["cash", "card", "transfer"];
const UNIT_FACTORS = { piece: 1, kilogram: 1, gram: 0.001, liter: 1, milliliter: 0.001, package: 1, box: 1 };

export class SaleDomainError extends Error {
  constructor(code, message, statusCode = 400, fields = []) {
    super(message);
    this.name = "SaleDomainError";
    this.code = code;
    this.statusCode = statusCode;
    this.fields = fields;
  }
}

function decimalToCents(value) {
  const text = String(value ?? "").trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) {
    throw new SaleDomainError("VALIDATION_ERROR", "El importe no tiene un formato válido.");
  }

  const [whole, fraction = ""] = text.split(".");
  return BigInt(whole) * 100n + BigInt((fraction + "00").slice(0, 2));
}

function centsToDecimal(cents) {
  const whole = cents / 100n;
  const fraction = String(cents % 100n).padStart(2, "0");
  return `${whole}.${fraction}`;
}

function productResponse(product, stock) {
  return {
    id: Number(product.id),
    name: product.name,
    sku: product.sku,
    barcode: product.barcode,
    brand: product.brand,
    price: Number(product.price),
    stock: Number(stock)
  };
}

export async function getPosLocation(businessId, locationId) {
  const result = await pool.query(
    `SELECT id, name, code, is_default
     FROM business_locations
     WHERE business_id = $1 AND id = $2 AND status = 'active'`,
    [businessId, locationId]
  );
  return result.rows[0] ?? null;
}

export async function getPosProducts({ businessId, query = "", locationId = null, limit = 30 }) {
  const result = await pool.query(
    `
      SELECT
        i.id, i.name, i.sku, i.barcode, i.brand, i.price,
        COALESCE(b.stock, 0)::INTEGER AS stock,
        l.id AS location_id
      FROM items i
      INNER JOIN business_locations l
        ON l.business_id = i.business_id
       AND l.status = 'active'
       AND ($2::INTEGER IS NOT NULL AND l.id = $2 OR $2::INTEGER IS NULL AND l.is_default)
      LEFT JOIN inventory_balances b
        ON (b.business_id, b.location_id, b.item_id) = (i.business_id, l.id, i.id)
      WHERE i.business_id = $1
        AND i.status = 'active'
        AND (
          $3 = ''
          OR i.name ILIKE '%' || $3 || '%'
          OR i.sku ILIKE '%' || $3 || '%'
          OR COALESCE(i.barcode, '') ILIKE '%' || $3 || '%'
        )
      ORDER BY LOWER(i.name), i.id
      LIMIT $4
    `,
    [businessId, locationId, query, limit]
  );

  return result.rows;
}

export async function getPosFormOptions(businessId) {
  const result = await pool.query(
    `SELECT id, name, code, is_default
     FROM business_locations
     WHERE business_id = $1 AND status = 'active'
     ORDER BY is_default DESC, LOWER(name), id`,
    [businessId]
  );

  return {
    locations: result.rows,
    defaultLocationId: result.rows.find((location) => location.is_default)?.id ?? null,
    paymentMethods: PAYMENT_METHODS
  };
}

function buildSaleHistoryWhere({ businessId, paymentMethod, status, dateFrom, dateTo, q }) {
  const values = [businessId];
  const where = ["s.business_id = $1"];

  if (paymentMethod) {
    values.push(paymentMethod);
    where.push(`s.payment_method = $${values.length}`);
  }
  if (status) {
    values.push(status);
    where.push(`s.status = $${values.length}`);
  }
  if (dateFrom) {
    values.push(dateFrom);
    where.push(`s.created_at >= $${values.length}::date`);
  }
  if (dateTo) {
    values.push(dateTo);
    where.push(`s.created_at < ($${values.length}::date + INTERVAL '1 day')`);
  }
  if (q) {
    values.push(q);
    const parameter = `$${values.length}`;
    where.push(`(s.id::TEXT ILIKE '%' || ${parameter} || '%' OR u.username ILIKE '%' || ${parameter} || '%')`);
  }

  return { values, where: where.join(" AND ") };
}

export async function countSales({ businessId, paymentMethod, status, dateFrom, dateTo, q }) {
  const { values, where } = buildSaleHistoryWhere({ businessId, paymentMethod, status, dateFrom, dateTo, q });
  const result = await pool.query(
    `SELECT COUNT(*)::INTEGER AS total
     FROM sales s
     INNER JOIN users u ON u.id = s.created_by
     WHERE ${where}`,
    values
  );
  return Number(result.rows[0]?.total ?? 0);
}

export async function getSales({ businessId, paymentMethod, status, dateFrom, dateTo, q, limit, offset }) {
  const { values, where } = buildSaleHistoryWhere({ businessId, paymentMethod, status, dateFrom, dateTo, q });
  values.push(limit, offset);

  const result = await pool.query(
    `SELECT
       s.id,
       s.created_at,
       s.payment_method,
       s.subtotal,
       s.total,
       s.amount_received,
       s.change_amount,
       s.status,
       u.id AS created_by_id,
       u.username,
       l.id AS location_id,
       l.name AS location_name,
       l.code AS location_code,
       COALESCE(SUM(si.quantity), 0)::INTEGER AS item_count
     FROM sales s
     INNER JOIN users u ON u.id = s.created_by
     INNER JOIN business_locations l
       ON (l.business_id, l.id) = (s.business_id, s.location_id)
     LEFT JOIN sale_items si
       ON (si.business_id, si.sale_id) = (s.business_id, s.id)
     WHERE ${where}
     GROUP BY s.id, s.created_at, s.payment_method, s.subtotal, s.total,
              s.amount_received, s.change_amount, s.status,
              u.id, u.username, l.id, l.name, l.code
     ORDER BY s.created_at DESC, s.id DESC
     LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values
  );
  return result.rows;
}

export async function getSaleDetails({ businessId, saleId }) {
  const saleResult = await pool.query(
    `SELECT
       s.id,
       s.created_at,
       s.payment_method,
       s.subtotal,
       s.total,
       s.amount_received,
       s.change_amount,
       s.status,
       u.username,
       l.id AS location_id,
       l.name AS location_name,
       l.code AS location_code
     FROM sales s
     INNER JOIN users u ON u.id = s.created_by
     INNER JOIN business_locations l
       ON (l.business_id, l.id) = (s.business_id, s.location_id)
     WHERE s.business_id = $1 AND s.id = $2`,
    [businessId, saleId]
  );

  const sale = saleResult.rows[0];
  if (!sale) return null;

  const [itemsResult, movementsResult] = await Promise.all([
    pool.query(
      `SELECT
         si.item_id,
         i.name,
         i.sku,
         i.barcode,
         si.quantity,
         si.unit_price,
         si.unit_cost,
         si.line_total
       FROM sale_items si
       INNER JOIN items i
         ON (i.business_id, i.id) = (si.business_id, si.item_id)
       WHERE si.business_id = $1 AND si.sale_id = $2
       ORDER BY si.id`,
      [businessId, saleId]
    ),
    pool.query(
      `SELECT
         m.id,
         m.movement_type,
         m.quantity_delta,
         m.created_at,
         m.reference,
         l.id AS location_id,
         l.name AS location_name,
         l.code AS location_code
       FROM inventory_movements m
       INNER JOIN business_locations l
         ON (l.business_id, l.id) = (m.business_id, m.location_id)
       WHERE m.business_id = $1
         AND m.reference = 'SALE-' || $2::TEXT
       ORDER BY m.created_at, m.id`,
      [businessId, saleId]
    )
  ]);

  return {
    sale,
    items: itemsResult.rows,
    movements: movementsResult.rows
  };
}

export async function createPosSale({ businessId, userId, locationId, paymentMethod, amountReceived, items }) {
  const client = await pool.connect();
  let transactionStarted = false;

  try {
    await client.query("BEGIN");
    transactionStarted = true;

    const locationResult = await client.query(
      `SELECT id, name, code
       FROM business_locations
       WHERE business_id = $1 AND id = $2 AND status = 'active'
       FOR KEY SHARE`,
      [businessId, locationId]
    );
    if (!locationResult.rows[0]) {
      throw new SaleDomainError("POS_LOCATION_REQUIRED", "Selecciona una ubicación activa.", 400, [{ field: "locationId", message: "Selecciona una ubicación activa." }]);
    }

    let cashSessionId = null;
    if (paymentMethod === "cash") {
      const cashSessionResult = await client.query(
        `SELECT cs.id
         FROM cash_sessions cs
         INNER JOIN cash_registers cr
           ON (cr.business_id, cr.id) = (cs.business_id, cs.register_id)
         WHERE cs.business_id = $1
           AND cr.location_id = $2
           AND cr.status = 'active'
           AND cs.status = 'open'
         ORDER BY cs.opened_at DESC, cs.id DESC
         LIMIT 1
         FOR UPDATE OF cs`,
        [businessId, locationId]
      );
      if (!cashSessionResult.rows[0]) {
        throw new SaleDomainError(
          "CASH_SESSION_REQUIRED",
          "Abre una sesión de caja para registrar ventas en efectivo.",
          409,
          [{ field: "paymentMethod", message: "No existe una sesión de caja abierta para esta ubicación." }]
        );
      }
      cashSessionId = Number(cashSessionResult.rows[0].id);
    }

    const sortedItemIds = [...new Set(items.map((item) => item.itemId))].sort((a, b) => a - b);
    const productsResult = await client.query(
      `SELECT id, name, sku, barcode, price, cost_price, status
       FROM items
       WHERE business_id = $1 AND id = ANY($2::INTEGER[])
       ORDER BY id
       FOR UPDATE`,
      [businessId, sortedItemIds]
    );
    const productsById = new Map(productsResult.rows.map((product) => [Number(product.id), product]));

    for (const item of items) {
      const product = productsById.get(item.itemId);
      if (!product) {
        throw new SaleDomainError("POS_PRODUCT_NOT_FOUND", "Uno de los productos no existe en el negocio activo.", 404, [{ field: "items", message: "Uno de los productos no existe en el negocio activo." }]);
      }
      if (product.status !== "active") {
        throw new SaleDomainError("POS_PRODUCT_INACTIVE", "No puedes vender un producto archivado.", 409, [{ field: "items", message: "Uno de los productos está archivado." }]);
      }
    }

    const recipeResult = await client.query(
      `SELECT r.product_id, ri.item_id, ri.quantity, ri.unit, r.id AS recipe_id
       FROM recipes r
       INNER JOIN recipe_ingredients ri ON (ri.business_id, ri.recipe_id) = (r.business_id, r.id)
       WHERE r.business_id = $1 AND r.status = 'active' AND r.product_id = ANY($2::INTEGER[])
       ORDER BY r.product_id, ri.id`,
      [businessId, sortedItemIds]
    );
    const recipeDeductions = new Map();
    for (const ingredient of recipeResult.rows) {
      const sold = items.find((item) => Number(item.itemId) === Number(ingredient.product_id));
      const amount = Number(ingredient.quantity) * UNIT_FACTORS[ingredient.unit] * Number(sold.quantity);
      const current = recipeDeductions.get(Number(ingredient.item_id)) ?? { amount: 0, recipeId: Number(ingredient.recipe_id) };
      current.amount += amount;
      recipeDeductions.set(Number(ingredient.item_id), current);
    }
    const allItemIds = [...new Set([...sortedItemIds, ...recipeDeductions.keys()])];

    await client.query(
      `INSERT INTO inventory_balances (business_id, location_id, item_id, stock)
       SELECT $1, $2, item_id, 0 FROM unnest($3::INTEGER[]) AS ids(item_id)
       ON CONFLICT (business_id, location_id, item_id) DO NOTHING`,
      [businessId, locationId, allItemIds]
    );
    const balancesResult = await client.query(
      `SELECT item_id, stock
       FROM inventory_balances
       WHERE business_id = $1 AND location_id = $2 AND item_id = ANY($3::INTEGER[])
       ORDER BY item_id
       FOR UPDATE`,
      [businessId, locationId, allItemIds]
    );
    const stockById = new Map(balancesResult.rows.map((balance) => [Number(balance.item_id), Number(balance.stock)]));

    const totalExits = new Map(items.map((item) => [Number(item.itemId), Number(item.quantity)]));
    for (const [itemId, deduction] of recipeDeductions) totalExits.set(itemId, (totalExits.get(itemId) ?? 0) + deduction.amount);
    for (const [itemId, quantity] of totalExits) {
      if (!Number.isInteger(quantity) || (stockById.get(itemId) ?? 0) < quantity) {
        const product = productsById.get(itemId);
        throw new SaleDomainError("POS_INSUFFICIENT_STOCK", `No hay existencias suficientes para ${product?.name ?? "un ingrediente de la receta"}.`, 409, [{ field: "items", message: "La venta requiere existencias suficientes para el producto y sus ingredientes." }]);
      }
    }

    const lines = [];
    let subtotalCents = 0n;
    for (const item of items) {
      const product = productsById.get(item.itemId);
      const previousStock = stockById.get(item.itemId) ?? 0;
      const unitPriceCents = decimalToCents(product.price);
      const lineTotalCents = unitPriceCents * BigInt(item.quantity);
      subtotalCents += lineTotalCents;
      lines.push({ product, quantity: item.quantity, unitPriceCents, lineTotalCents });
    }

    const receivedCents = amountReceived === undefined || amountReceived === null || amountReceived === ""
      ? 0n
      : decimalToCents(amountReceived);
    if (paymentMethod === "cash" && (amountReceived === undefined || amountReceived === null || amountReceived === "")) {
      throw new SaleDomainError("POS_CASH_REQUIRED", "Indica el efectivo recibido para una venta en efectivo.", 400, [{ field: "amountReceived", message: "El efectivo recibido es obligatorio." }]);
    }
    if (paymentMethod === "cash" && receivedCents < subtotalCents) {
      throw new SaleDomainError("POS_CASH_INSUFFICIENT", "El efectivo recibido es insuficiente.", 400, [{ field: "amountReceived", message: "El efectivo recibido debe cubrir el total." }]);
    }
    const changeCents = paymentMethod === "cash" ? receivedCents - subtotalCents : 0n;
    const saleResult = await client.query(
      `INSERT INTO sales (business_id, location_id, created_by, payment_method, cash_session_id, subtotal, total, amount_received, change_amount)
       VALUES ($1, $2, $3, $4, $5, $6, $6, $7, $8)
       RETURNING id, created_at, payment_method, subtotal, total, amount_received, change_amount, status`,
      [businessId, locationId, userId, paymentMethod, cashSessionId, centsToDecimal(subtotalCents), centsToDecimal(paymentMethod === "cash" ? receivedCents : 0n), centsToDecimal(changeCents)]
    );
    const sale = saleResult.rows[0];

    const currentStocks = new Map(stockById);
    for (const line of lines) {
      const previousStock = currentStocks.get(Number(line.product.id));
      const resultingStock = previousStock - line.quantity;
      currentStocks.set(Number(line.product.id), resultingStock);
      await client.query(
        `INSERT INTO sale_items (business_id, sale_id, item_id, quantity, unit_price, unit_cost, line_total)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [businessId, sale.id, line.product.id, line.quantity, centsToDecimal(line.unitPriceCents), line.product.cost_price === null ? null : line.product.cost_price, centsToDecimal(line.lineTotalCents)]
      );
      await client.query(
        `INSERT INTO inventory_movements
          (business_id, location_id, item_id, movement_type, quantity_delta, previous_stock, resulting_stock, reason, reference, created_by)
         VALUES ($1, $2, $3, 'exit', $4, $5, $6, 'Venta en punto de venta', $7, $8)`,
        [businessId, locationId, line.product.id, -line.quantity, previousStock, resultingStock, `SALE-${sale.id}`, userId]
      );
      await client.query(
        `UPDATE inventory_balances
         SET stock = $1
         WHERE business_id = $2 AND location_id = $3 AND item_id = $4`,
        [resultingStock, businessId, locationId, line.product.id]
      );
      await client.query(
        `UPDATE items
         SET stock = stock - $1
         WHERE business_id = $2 AND id = $3 AND status = 'active'`,
        [line.quantity, businessId, line.product.id]
      );
    }

    for (const [itemId, deduction] of recipeDeductions) {
      const previousStock = currentStocks.get(itemId);
      const resultingStock = previousStock - deduction.amount;
      currentStocks.set(itemId, resultingStock);
      await client.query(`INSERT INTO inventory_movements (business_id, location_id, item_id, movement_type, quantity_delta, previous_stock, resulting_stock, reason, reference, created_by) VALUES ($1,$2,$3,'exit',$4,$5,$6,'Ingredientes consumidos por venta',$7,$8)`, [businessId, locationId, itemId, -deduction.amount, previousStock, resultingStock, `SALE-${sale.id}`, userId]);
      await client.query("UPDATE inventory_balances SET stock=$1 WHERE business_id=$2 AND location_id=$3 AND item_id=$4", [resultingStock, businessId, locationId, itemId]);
      await client.query("UPDATE items SET stock=stock-$1 WHERE business_id=$2 AND id=$3", [deduction.amount, businessId, itemId]);
    }

    if (cashSessionId !== null) {
      await client.query(
        `INSERT INTO cash_movements
          (business_id, session_id, movement_type, amount, reason, created_by)
         VALUES ($1, $2, 'sale', $3, 'Venta en punto de venta', $4)`,
        [businessId, cashSessionId, sale.total, userId]
      );
    }

    await auditService.record({ client, businessId, userId, module: "sales", action: "create", reference: `SALE-${sale.id}`, description: "Venta registrada", newValues: { saleId: sale.id, locationId, paymentMethod, items } });
    await client.query("COMMIT");
    transactionStarted = false;
    return {
      sale,
      location: locationResult.rows[0],
      items: lines.map((line) => ({
        itemId: Number(line.product.id),
        name: line.product.name,
        sku: line.product.sku,
        quantity: line.quantity,
        unitPrice: Number(line.product.price),
        lineTotal: Number(centsToDecimal(line.lineTotalCents)),
        resultingStock: currentStocks.get(Number(line.product.id))
      }))
    };
  } catch (error) {
    if (transactionStarted) await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
