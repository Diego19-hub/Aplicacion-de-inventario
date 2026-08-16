import pool from "./pool.js";

export async function getAdminDashboardStats() {
  const result = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM businesses)::INTEGER AS businesses_total,
      (SELECT COUNT(*) FROM businesses WHERE status = 'active')::INTEGER AS businesses_active,
      (SELECT COUNT(*) FROM businesses WHERE status = 'suspended')::INTEGER AS businesses_suspended,
      (SELECT COUNT(*) FROM businesses WHERE status = 'archived')::INTEGER AS businesses_archived,
      (SELECT COUNT(*) FROM users)::INTEGER AS users_total,
      (SELECT COUNT(*) FROM business_members WHERE status = 'active')::INTEGER AS active_memberships,
      (SELECT COUNT(*) FROM items)::INTEGER AS items_total
  `);

  return result.rows[0];
}

export async function getBusinessesPage({ search, status, limit, offset }) {
  const result = await pool.query(
    `
      SELECT
        businesses.id,
        businesses.name,
        businesses.slug,
        businesses.status,
        businesses.created_at,
        owner.username AS owner_username,
        owner.email AS owner_email,
        COALESCE(member_counts.active_members, 0)::INTEGER AS active_members,
        COALESCE(item_counts.items_count, 0)::INTEGER AS items_count
      FROM businesses
      LEFT JOIN LATERAL (
        SELECT users.username, users.email
        FROM business_members
        INNER JOIN users ON users.id = business_members.user_id
        WHERE business_members.business_id = businesses.id
          AND business_members.role = 'owner'
          AND business_members.status = 'active'
        ORDER BY business_members.id
        LIMIT 1
      ) AS owner ON TRUE
      LEFT JOIN LATERAL (
        SELECT COUNT(*) AS active_members
        FROM business_members
        WHERE business_members.business_id = businesses.id
          AND business_members.status = 'active'
      ) AS member_counts ON TRUE
      LEFT JOIN LATERAL (
        SELECT COUNT(*) AS items_count
        FROM items
        WHERE items.business_id = businesses.id
      ) AS item_counts ON TRUE
      WHERE ($1 = '' OR businesses.name ILIKE '%' || $1 || '%'
        OR businesses.slug ILIKE '%' || $1 || '%'
        OR owner.username ILIKE '%' || $1 || '%'
        OR owner.email ILIKE '%' || $1 || '%')
        AND ($2 = 'all' OR businesses.status = $2)
      ORDER BY businesses.created_at DESC, businesses.id DESC
      LIMIT $3 OFFSET $4
    `,
    [search, status, limit, offset]
  );

  return result.rows;
}

export async function countBusinesses({ search, status }) {
  const result = await pool.query(
    `
      SELECT COUNT(*)::INTEGER AS total
      FROM businesses
      LEFT JOIN LATERAL (
        SELECT users.username, users.email
        FROM business_members
        INNER JOIN users ON users.id = business_members.user_id
        WHERE business_members.business_id = businesses.id
          AND business_members.role = 'owner'
          AND business_members.status = 'active'
        ORDER BY business_members.id
        LIMIT 1
      ) AS owner ON TRUE
      WHERE ($1 = '' OR businesses.name ILIKE '%' || $1 || '%'
        OR businesses.slug ILIKE '%' || $1 || '%'
        OR owner.username ILIKE '%' || $1 || '%'
        OR owner.email ILIKE '%' || $1 || '%')
        AND ($2 = 'all' OR businesses.status = $2)
    `,
    [search, status]
  );

  return result.rows[0].total;
}

export async function getBusinessAdminDetails(businessId) {
  const result = await pool.query(
    `
      SELECT
        businesses.id,
        businesses.name,
        businesses.slug,
        businesses.legal_name,
        businesses.tax_id,
        businesses.currency,
        businesses.timezone,
        businesses.status,
        businesses.created_by,
        businesses.created_at,
        businesses.updated_at,
        owner.id AS owner_id,
        owner.username AS owner_username,
        owner.email AS owner_email,
        COALESCE(member_counts.members_count, 0)::INTEGER AS members_count,
        COALESCE(category_counts.categories_count, 0)::INTEGER AS categories_count,
        COALESCE(item_counts.items_count, 0)::INTEGER AS items_count
      FROM businesses
      LEFT JOIN LATERAL (
        SELECT users.id, users.username, users.email
        FROM business_members
        INNER JOIN users ON users.id = business_members.user_id
        WHERE business_members.business_id = businesses.id
          AND business_members.role = 'owner'
          AND business_members.status = 'active'
        ORDER BY business_members.id
        LIMIT 1
      ) AS owner ON TRUE
      LEFT JOIN LATERAL (
        SELECT COUNT(*) AS members_count
        FROM business_members
        WHERE business_members.business_id = businesses.id
      ) AS member_counts ON TRUE
      LEFT JOIN LATERAL (
        SELECT COUNT(*) AS categories_count
        FROM categories
        WHERE categories.business_id = businesses.id
      ) AS category_counts ON TRUE
      LEFT JOIN LATERAL (
        SELECT COUNT(*) AS items_count
        FROM items
        WHERE items.business_id = businesses.id
      ) AS item_counts ON TRUE
      WHERE businesses.id = $1
    `,
    [businessId]
  );

  return result.rows[0];
}

export async function findUserByEmail(email) {
  const result = await pool.query(
    `
      SELECT id, username, email
      FROM users
      WHERE LOWER(email) = LOWER($1)
    `,
    [email]
  );

  return result.rows[0];
}

export async function createBusinessWithOwner(data, ownerId, createdBy) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SET LOCAL statement_timeout = '30s'");

    const businessResult = await client.query(
      `
        INSERT INTO businesses (
          name, slug, legal_name, tax_id, currency, timezone, created_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id, name, slug, status
      `,
      [
        data.name,
        data.slug,
        data.legalName || null,
        data.taxId || null,
        data.currency,
        data.timezone,
        createdBy
      ]
    );
    const business = businessResult.rows[0];

    await client.query(
      `
        INSERT INTO business_members (business_id, user_id, role, status)
        VALUES ($1, $2, 'owner', 'active')
      `,
      [business.id, ownerId]
    );

    await client.query(
      `INSERT INTO business_locations (business_id, name, code, location_type, is_default)
       VALUES ($1, 'Sucursal principal', 'MAIN', 'branch', true)`,
      [business.id]
    );

    await client.query(
      `INSERT INTO categories (business_id, name, description, is_default)
       VALUES ($1, 'Sin categoría', '', true)`,
      [business.id]
    );

    await client.query("COMMIT");
    return business;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function updateBusiness(businessId, data) {
  const result = await pool.query(
    `
      UPDATE businesses
      SET
        name = $1,
        slug = $2,
        legal_name = $3,
        tax_id = $4,
        currency = $5,
        timezone = $6
      WHERE id = $7
      RETURNING id
    `,
    [
      data.name,
      data.slug,
      data.legalName || null,
      data.taxId || null,
      data.currency,
      data.timezone,
      businessId
    ]
  );

  return result.rows[0];
}

export async function updateBusinessStatus(businessId, fromStatus, toStatus) {
  const result = await pool.query(
    `
      UPDATE businesses
      SET status = $1
      WHERE id = $2
        AND status = $3
      RETURNING id, status
    `,
    [toStatus, businessId, fromStatus]
  );

  return result.rows[0];
}
