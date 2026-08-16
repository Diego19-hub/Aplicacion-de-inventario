import pool from "./pool.js";
import {
  createBusinessWithOwner,
  updateBusiness
} from "./adminQueries.js";

function baseFilters(q, status) {
  const values = [];
  const where = [];

  if (q) {
    values.push(`%${q}%`);
    where.push(
      `(b.name ILIKE $${values.length}
        OR b.slug ILIKE $${values.length}
        OR b.legal_name ILIKE $${values.length}
        OR b.tax_id ILIKE $${values.length})`
    );
  }

  if (status) {
    values.push(status);
    where.push(`b.status = $${values.length}`);
  }

  return {
    values,
    where: where.length ? `WHERE ${where.join(" AND ")}` : ""
  };
}

export async function adminDashboard() {
  const [metrics, recent] = await Promise.all([
    pool.query(`
      SELECT
        COUNT(*)::int AS businesses,
        COUNT(*) FILTER (WHERE status = 'active')::int AS active,
        COUNT(*) FILTER (WHERE status = 'suspended')::int AS suspended,
        COUNT(*) FILTER (WHERE status = 'archived')::int AS archived,
        (SELECT COUNT(*)::int FROM users) AS users,
        (SELECT COUNT(*)::int FROM business_members WHERE status = 'active') AS active_members,
        (SELECT COUNT(*)::int FROM items WHERE status = 'active') AS active_products
      FROM businesses
    `),
    pool.query(`
      SELECT id, name, slug, status, created_at
      FROM businesses
      ORDER BY created_at DESC, id DESC
      LIMIT 5
    `)
  ]);

  return {
    metrics: metrics.rows[0],
    recent: recent.rows
  };
}

export async function adminBusinesses({ q, status, limit, offset }) {
  const filters = baseFilters(q, status);
  const from = ` FROM businesses b ${filters.where}`;
  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS count${from}`,
    filters.values
  );
  const values = [...filters.values, limit, offset];
  const rows = await pool.query(
    `
      SELECT
        b.*,
        COALESCE((
          SELECT COUNT(*)
          FROM business_members m
          WHERE m.business_id = b.id
            AND m.status = 'active'
        ), 0)::int AS active_members,
        COALESCE((
          SELECT COUNT(*)
          FROM items i
          WHERE i.business_id = b.id
            AND i.status = 'active'
        ), 0)::int AS active_products
      ${from}
      ORDER BY b.created_at DESC, b.id DESC
      LIMIT $${values.length - 1}
      OFFSET $${values.length}
    `,
    values
  );

  return {
    count: countResult.rows[0].count,
    rows: rows.rows
  };
}

export async function adminBusiness(id) {
  const business = await pool.query(
    `
      SELECT
        b.*,
        owner.id AS owner_id,
        owner.username AS owner_username,
        owner.email AS owner_email,
        (SELECT COUNT(*)::int FROM business_members WHERE business_id = b.id AND status = 'active') AS active_members,
        (SELECT COUNT(*)::int FROM items WHERE business_id = b.id AND status = 'active') AS active_products,
        (SELECT COUNT(*)::int FROM items WHERE business_id = b.id AND status = 'archived') AS archived_products,
        (SELECT COUNT(*)::int FROM business_locations WHERE business_id = b.id AND status = 'active') AS active_locations,
        (SELECT COALESCE(SUM(stock), 0)::int FROM inventory_balances WHERE business_id = b.id) AS total_stock,
        (SELECT COUNT(*)::int FROM inventory_transfers WHERE business_id = b.id) AS transfers,
        (SELECT COUNT(*)::int FROM inventory_stock_thresholds WHERE business_id = b.id) AS thresholds
      FROM businesses b
      LEFT JOIN LATERAL (
        SELECT u.id, u.username, u.email
        FROM business_members bm
        JOIN users u ON u.id = bm.user_id
        WHERE bm.business_id = b.id
          AND bm.role = 'owner'
          AND bm.status = 'active'
        ORDER BY bm.id
        LIMIT 1
      ) AS owner ON TRUE
      WHERE b.id = $1
    `,
    [id]
  );

  if (!business.rows[0]) return null;

  const [members, movements] = await Promise.all([
    pool.query(
      `
        SELECT
          bm.id,
          bm.role,
          bm.status,
          bm.joined_at,
          bm.created_at,
          u.username,
          u.email
        FROM business_members bm
        JOIN users u ON u.id = bm.user_id
        WHERE bm.business_id = $1
        ORDER BY u.username
      `,
      [id]
    ),
    pool.query(
      `
        SELECT
          m.id,
          m.created_at,
          m.movement_type,
          m.quantity_delta,
          i.name AS item_name,
          i.sku,
          l.name AS location_name,
          l.code,
          u.username
        FROM inventory_movements m
        JOIN items i
          ON (i.business_id, i.id) = (m.business_id, m.item_id)
        JOIN business_locations l
          ON (l.business_id, l.id) = (m.business_id, m.location_id)
        JOIN users u ON u.id = m.created_by
        WHERE m.business_id = $1
        ORDER BY m.created_at DESC, m.id DESC
        LIMIT 5
      `,
      [id]
    )
  ]);

  return {
    business: business.rows[0],
    members: members.rows,
    movements: movements.rows
  };
}

export async function getAdminBusinessFormOptions() {
  const result = await pool.query(`
    SELECT id, username, email
    FROM users
    ORDER BY lower(username), id
  `);

  return result.rows;
}

export async function getAdminBusinessForEdit(businessId) {
  const result = await pool.query(
    `
      SELECT id, name, slug, legal_name, tax_id, currency, timezone
      FROM businesses
      WHERE id = $1
    `,
    [businessId]
  );

  return result.rows[0] ?? null;
}

export async function getAdminUserById(userId) {
  const result = await pool.query(
    `
      SELECT id
      FROM users
      WHERE id = $1
    `,
    [userId]
  );

  return result.rows[0] ?? null;
}

export async function createAdminBusiness(data, ownerUserId, createdBy) {
  return createBusinessWithOwner(data, ownerUserId, createdBy);
}

export async function updateAdminBusiness(businessId, data) {
  return updateBusiness(businessId, data);
}

export async function transitionAdminBusinessStatus(businessId, action) {
  const destinationByAction = {
    suspend: "suspended",
    reactivate: "active",
    archive: "archived"
  };
  const destination = destinationByAction[action];
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SET LOCAL statement_timeout = '30s'");

    const current = await client.query(
      "SELECT id, status FROM businesses WHERE id = $1 FOR UPDATE",
      [businessId]
    );

    if (!current.rows[0]) {
      await client.query("ROLLBACK");
      return { kind: "not_found" };
    }

    const status = current.rows[0].status;
    const allowed = (
      (action === "suspend" && status === "active")
      || (action === "reactivate" && status === "suspended")
      || (action === "archive" && ["active", "suspended"].includes(status))
    );

    if (!allowed) {
      await client.query("ROLLBACK");
      return { kind: "invalid", status };
    }

    const updated = await client.query(
      `
        UPDATE businesses
        SET status = $1
        WHERE id = $2
        RETURNING id, status, updated_at
      `,
      [destination, businessId]
    );

    await client.query("COMMIT");
    return { kind: "updated", business: updated.rows[0] };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // El error original conserva prioridad.
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function getAdminOwnerTransferOptions(businessId, q) {
  const businessResult = await pool.query(
    `
      SELECT
        b.id,
        b.name,
        b.slug,
        b.legal_name,
        b.tax_id,
        b.currency,
        b.timezone,
        b.status,
        b.created_at,
        b.updated_at,
        owner.id AS owner_id,
        owner.username AS owner_username,
        owner.email AS owner_email
      FROM businesses b
      LEFT JOIN LATERAL (
        SELECT u.id, u.username, u.email
        FROM business_members bm
        JOIN users u ON u.id = bm.user_id
        WHERE bm.business_id = b.id
          AND bm.role = 'owner'
          AND bm.status = 'active'
        ORDER BY bm.id
        LIMIT 1
      ) AS owner ON TRUE
      WHERE b.id = $1
    `,
    [businessId]
  );

  const business = businessResult.rows[0] ?? null;
  if (!business) return null;

  const usersResult = await pool.query(
    `
      SELECT
        u.id,
        u.username,
        u.email,
        bm.role AS membership_role,
        bm.status AS membership_status
      FROM users u
      LEFT JOIN business_members bm
        ON bm.business_id = $1
       AND bm.user_id = u.id
      WHERE u.id <> COALESCE($2, 0)
        AND (
          $3 = ''
          OR u.username ILIKE '%' || $3 || '%'
          OR u.email ILIKE '%' || $3 || '%'
        )
      ORDER BY lower(u.username), u.id
      LIMIT 20
    `,
    [businessId, business.owner_id ?? null, q]
  );

  return {
    business,
    users: usersResult.rows
  };
}

export async function transferAdminBusinessOwner(businessId, newOwnerUserId) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SET LOCAL statement_timeout = '30s'");

    const businessResult = await client.query(
      `
        SELECT id, name, slug, legal_name, tax_id, currency, timezone, status, created_at, updated_at
        FROM businesses
        WHERE id = $1
        FOR UPDATE
      `,
      [businessId]
    );
    const business = businessResult.rows[0] ?? null;

    if (!business) {
      await client.query("ROLLBACK");
      return { kind: "business_not_found" };
    }

    if (!["active", "suspended"].includes(business.status)) {
      await client.query("ROLLBACK");
      return { kind: "invalid_business_state", status: business.status };
    }

    const userResult = await client.query(
      `
        SELECT id, username, email
        FROM users
        WHERE id = $1
        FOR SHARE
      `,
      [newOwnerUserId]
    );
    const newOwner = userResult.rows[0] ?? null;

    if (!newOwner) {
      await client.query("ROLLBACK");
      return { kind: "user_not_found" };
    }

    const membershipsResult = await client.query(
      `
        SELECT id, user_id, role, status
        FROM business_members
        WHERE business_id = $1
        ORDER BY id
        FOR UPDATE
      `,
      [businessId]
    );
    const memberships = membershipsResult.rows;
    const currentOwner = memberships.find(
      (membership) => membership.role === "owner" && membership.status === "active"
    );

    if (!currentOwner) {
      throw new Error(
        `No existe un owner activo bloqueado para business ${businessId}.`
      );
    }

    if (Number(currentOwner.user_id) === newOwnerUserId) {
      await client.query("ROLLBACK");
      return { kind: "same_owner" };
    }

    const targetMembership = memberships.find(
      (membership) => Number(membership.user_id) === newOwnerUserId
    );

    await client.query(
      `
        UPDATE business_members
        SET role = 'manager', status = 'active'
        WHERE id = $1
      `,
      [currentOwner.id]
    );

    if (targetMembership) {
      await client.query(
        `
          UPDATE business_members
          SET role = 'owner', status = 'active'
          WHERE id = $1
        `,
        [targetMembership.id]
      );
    } else {
      await client.query(
        `
          INSERT INTO business_members (business_id, user_id, role, status)
          VALUES ($1, $2, 'owner', 'active')
        `,
        [businessId, newOwnerUserId]
      );
    }

    const previousOwnerResult = await client.query(
      `
        SELECT u.id, u.username, u.email
        FROM users u
        WHERE u.id = $1
      `,
      [currentOwner.user_id]
    );

    await client.query("COMMIT");

    return {
      kind: "updated",
      business,
      previousOwner: previousOwnerResult.rows[0],
      newOwner
    };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // El error original conserva prioridad.
    }
    throw error;
  } finally {
    client.release();
  }
}
