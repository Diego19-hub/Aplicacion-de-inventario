import pool from "./pool.js";

export async function getApiBusinessMembers(businessId) {
  const result = await pool.query(
    `
      SELECT
        bm.id,
        bm.user_id,
        bm.role,
        bm.status,
        bm.joined_at,
        bm.created_at,
        u.username,
        u.email
      FROM business_members bm
      INNER JOIN users u ON u.id = bm.user_id
      WHERE bm.business_id = $1
      ORDER BY
        CASE WHEN bm.role = 'owner' THEN 0 ELSE 1 END,
        CASE WHEN bm.status = 'active' THEN 0 ELSE 1 END,
        LOWER(u.username),
        bm.id
    `,
    [businessId]
  );
  return result.rows;
}

export async function getApiBusinessInvitations(businessId) {
  const result = await pool.query(
    `
      SELECT
        bi.id,
        bi.email_normalized,
        bi.offered_role,
        bi.status,
        bi.expires_at,
        bi.created_at,
        bi.accepted_at,
        (bi.status = 'pending' AND bi.expires_at <= CURRENT_TIMESTAMP) AS is_expired,
        inviter.id AS invited_by_id,
        inviter.username AS invited_by_username
      FROM business_invitations bi
      INNER JOIN users inviter ON inviter.id = bi.invited_by
      WHERE bi.business_id = $1
      ORDER BY
        CASE WHEN bi.status = 'pending' THEN 0 ELSE 1 END,
        bi.created_at DESC,
        bi.id DESC
    `,
    [businessId]
  );
  return result.rows;
}

export async function getApiBusinessMemberSummary(businessId) {
  const result = await pool.query(
    `
      SELECT
        (
          SELECT COUNT(*)::INTEGER
          FROM business_members bm
          WHERE bm.business_id = $1
            AND bm.status = 'active'
        ) AS active_members,
        (
          SELECT COUNT(*)::INTEGER
          FROM business_invitations bi
          WHERE bi.business_id = $1
            AND bi.status = 'pending'
            AND bi.expires_at > CURRENT_TIMESTAMP
        ) AS pending_invitations
    `,
    [businessId]
  );
  return result.rows[0];
}
