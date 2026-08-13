import pool from "./pool.js";

function supplierFilters({ businessId, query, status }) {
  const values = [businessId];
  const where = ["s.business_id = $1"];

  if (status !== "all") {
    values.push(status);
    where.push(`s.status = $${values.length}`);
  }

  if (query) {
    values.push(`%${query}%`);
    where.push(`(
      s.name ILIKE $${values.length}
      OR s.legal_name ILIKE $${values.length}
      OR s.tax_id ILIKE $${values.length}
      OR s.contact_name ILIKE $${values.length}
      OR s.email ILIKE $${values.length}
    )`);
  }

  return { values, where: where.join(" AND ") };
}

export async function countApiSuppliers(filters) {
  const { values, where } = supplierFilters(filters);
  const result = await pool.query(
    `SELECT COUNT(*)::INTEGER AS count FROM suppliers s WHERE ${where}`,
    values
  );
  return result.rows[0].count;
}

export async function getApiSuppliers({ limit, offset, ...filters }) {
  const { values, where } = supplierFilters(filters);
  values.push(limit, offset);
  const result = await pool.query(
    `
      SELECT
        s.id, s.name, s.legal_name, s.tax_id, s.contact_name, s.email,
        s.phone, s.status, s.updated_at
      FROM suppliers s
      WHERE ${where}
      ORDER BY LOWER(s.name), s.id
      LIMIT $${values.length - 1} OFFSET $${values.length}
    `,
    values
  );
  return result.rows;
}

export async function getApiSupplierById(businessId, supplierId) {
  const result = await pool.query(
    `
      SELECT
        s.id, s.name, s.legal_name, s.tax_id, s.contact_name, s.email,
        s.phone, s.address, s.notes, s.status, s.created_at, s.updated_at
      FROM suppliers s
      WHERE s.business_id = $1
        AND s.id = $2
    `,
    [businessId, supplierId]
  );
  return result.rows[0] ?? null;
}

export async function createApiSupplier(businessId, data) {
  const result = await pool.query(
    `
      INSERT INTO suppliers (
        business_id, name, legal_name, tax_id, contact_name, email, phone, address, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING
        id, name, legal_name, tax_id, contact_name, email, phone, address, notes,
        status, created_at, updated_at
    `,
    [
      businessId,
      data.name,
      data.legalName,
      data.taxId,
      data.contactName,
      data.email,
      data.phone,
      data.address,
      data.notes
    ]
  );
  return result.rows[0];
}

export async function updateApiSupplier(businessId, supplierId, data) {
  const result = await pool.query(
    `
      UPDATE suppliers
      SET
        name = $1,
        legal_name = $2,
        tax_id = $3,
        contact_name = $4,
        email = $5,
        phone = $6,
        address = $7,
        notes = $8
      WHERE business_id = $9
        AND id = $10
      RETURNING
        id, name, legal_name, tax_id, contact_name, email, phone, address, notes,
        status, created_at, updated_at
    `,
    [
      data.name,
      data.legalName,
      data.taxId,
      data.contactName,
      data.email,
      data.phone,
      data.address,
      data.notes,
      businessId,
      supplierId
    ]
  );
  return result.rows[0] ?? null;
}

export async function changeApiSupplierStatus(businessId, supplierId, fromStatus, toStatus) {
  const result = await pool.query(
    `
      UPDATE suppliers
      SET status = $1
      WHERE business_id = $2
        AND id = $3
        AND status = $4
      RETURNING
        id, name, legal_name, tax_id, contact_name, email, phone, address, notes,
        status, created_at, updated_at
    `,
    [toStatus, businessId, supplierId, fromStatus]
  );
  return result.rows[0] ?? null;
}
