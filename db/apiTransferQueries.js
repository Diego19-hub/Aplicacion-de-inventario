import pool from "./pool.js";

function transferFilters({ businessId, query, locationId }) {
  const values = [businessId];
  const where = ["t.business_id = $1"];

  if (query) {
    values.push(`%${query}%`);
    where.push(`(
      i.name ILIKE $${values.length}
      OR i.sku ILIKE $${values.length}
      OR t.reference ILIKE $${values.length}
    )`);
  }

  if (locationId !== null) {
    values.push(locationId);
    where.push(`(
      t.from_location_id = $${values.length}
      OR t.to_location_id = $${values.length}
    )`);
  }

  return { values, where: where.join(" AND ") };
}

export async function getApiTransferLocations(businessId) {
  const result = await pool.query(
    `
      SELECT id, name, code, is_default
      FROM business_locations
      WHERE business_id = $1
        AND status = 'active'
      ORDER BY is_default DESC, LOWER(name), id
    `,
    [businessId]
  );
  return result.rows;
}

export async function countApiTransfers(filters) {
  const { values, where } = transferFilters(filters);
  const result = await pool.query(
    `
      SELECT COUNT(*)::INTEGER AS count
      FROM inventory_transfers t
      INNER JOIN items i
        ON (i.business_id, i.id) = (t.business_id, t.item_id)
      WHERE ${where}
    `,
    values
  );
  return result.rows[0].count;
}

export async function getApiTransfers({ limit, offset, ...filters }) {
  const { values, where } = transferFilters(filters);
  values.push(limit, offset);
  const result = await pool.query(
    `
      SELECT
        t.id, t.quantity, t.reason, t.reference, t.created_at,
        i.id AS product_id, i.name AS product_name, i.sku AS product_sku,
        source.id AS from_location_id, source.name AS from_location_name, source.code AS from_location_code,
        destination.id AS to_location_id, destination.name AS to_location_name, destination.code AS to_location_code,
        u.id AS created_by_id, u.username
      FROM inventory_transfers t
      INNER JOIN items i
        ON (i.business_id, i.id) = (t.business_id, t.item_id)
      INNER JOIN business_locations source
        ON (source.business_id, source.id) = (t.business_id, t.from_location_id)
      INNER JOIN business_locations destination
        ON (destination.business_id, destination.id) = (t.business_id, t.to_location_id)
      INNER JOIN users u
        ON u.id = t.created_by
      WHERE ${where}
      ORDER BY t.created_at DESC, t.id DESC
      LIMIT $${values.length - 1} OFFSET $${values.length}
    `,
    values
  );
  return result.rows;
}

export async function getApiTransferById(businessId, transferId) {
  const transferResult = await pool.query(
    `
      SELECT
        t.id, t.quantity, t.reason, t.reference, t.created_at,
        i.id AS product_id, i.name AS product_name, i.sku AS product_sku,
        source.id AS from_location_id, source.name AS from_location_name, source.code AS from_location_code,
        destination.id AS to_location_id, destination.name AS to_location_name, destination.code AS to_location_code,
        u.id AS created_by_id, u.username
      FROM inventory_transfers t
      INNER JOIN items i
        ON (i.business_id, i.id) = (t.business_id, t.item_id)
      INNER JOIN business_locations source
        ON (source.business_id, source.id) = (t.business_id, t.from_location_id)
      INNER JOIN business_locations destination
        ON (destination.business_id, destination.id) = (t.business_id, t.to_location_id)
      INNER JOIN users u
        ON u.id = t.created_by
      WHERE t.business_id = $1
        AND t.id = $2
    `,
    [businessId, transferId]
  );
  const transfer = transferResult.rows[0];
  if (!transfer) return null;

  const movementResult = await pool.query(
    `
      SELECT
        m.id, m.movement_type, m.quantity_delta, m.previous_stock,
        m.resulting_stock, m.created_at,
        l.id AS location_id, l.name AS location_name, l.code AS location_code
      FROM inventory_movements m
      INNER JOIN business_locations l
        ON (l.business_id, l.id) = (m.business_id, m.location_id)
      WHERE m.business_id = $1
        AND m.transfer_id = $2
      ORDER BY CASE m.movement_type
        WHEN 'transfer_out' THEN 1
        WHEN 'transfer_in' THEN 2
        ELSE 3
      END, m.id
    `,
    [businessId, transferId]
  );
  const movements = movementResult.rows;
  const transferOut = movements.find((movement) => movement.movement_type === "transfer_out");
  const transferIn = movements.find((movement) => movement.movement_type === "transfer_in");
  const isConsistent = movements.length === 2
    && transferOut
    && transferIn
    && transferOut.location_id === transfer.from_location_id
    && transferIn.location_id === transfer.to_location_id
    && Number(transferOut.quantity_delta) === -Number(transfer.quantity)
    && Number(transferIn.quantity_delta) === Number(transfer.quantity);

  if (!isConsistent) {
    return { error: "inconsistent_transfer_movements", transferId };
  }

  return { transfer, transferOut, transferIn };
}
