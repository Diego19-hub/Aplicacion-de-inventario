import pool from "./pool.js";
import { normalizeEmail } from "../utils/email.js";

export async function expirePendingInvitations(businessId = null) {
  const filter = businessId ? "AND business_id = $1" : "";
  await pool.query(
    `UPDATE business_invitations SET status = 'expired'
     WHERE status = 'pending' AND expires_at <= CURRENT_TIMESTAMP ${filter}`,
    businessId ? [businessId] : []
  );
}

export async function getBusinessMembers(businessId) {
  const result = await pool.query(
    `SELECT business_members.id, business_members.user_id, business_members.role,
            business_members.status, business_members.joined_at,
            users.username, users.email
     FROM business_members INNER JOIN users ON users.id = business_members.user_id
     WHERE business_members.business_id = $1
     ORDER BY CASE WHEN business_members.role = 'owner' THEN 0 ELSE 1 END, users.username`,
    [businessId]
  );
  return result.rows;
}

export async function getBusinessInvitations(businessId) {
  const result = await pool.query(
    `SELECT id, email_normalized, offered_role, status, expires_at, created_at
     FROM business_invitations WHERE business_id = $1 ORDER BY created_at DESC`,
    [businessId]
  );
  return result.rows;
}

export async function createBusinessInvitation({ businessId, email, role, invitedBy, tokenHash }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT pg_advisory_xact_lock($1, hashtext($2))",
      [businessId, email]
    );
    await client.query(
      `UPDATE business_invitations SET status = 'expired'
       WHERE business_id = $1 AND status = 'pending' AND expires_at <= CURRENT_TIMESTAMP`,
      [businessId]
    );
    await client.query(
      `UPDATE business_invitations SET status = 'revoked'
       WHERE business_id = $1 AND email_normalized = $2 AND status = 'pending'`,
      [businessId, email]
    );
    const result = await client.query(
      `INSERT INTO business_invitations
        (business_id, email_normalized, offered_role, token_hash, invited_by, expires_at)
       VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP + INTERVAL '30 days')
       RETURNING id, email_normalized, offered_role, expires_at`,
      [businessId, email, role, tokenHash, invitedBy]
    );
    await client.query("COMMIT");
    return result.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}

export async function revokeBusinessInvitation(businessId, invitationId) {
  const result = await pool.query(
    `UPDATE business_invitations SET status = 'revoked'
     WHERE id = $1 AND business_id = $2 AND status = 'pending'
     RETURNING id`,
    [invitationId, businessId]
  );
  return result.rows[0];
}

export async function updateBusinessMember({ businessId, membershipId, actorUserId, role = null, status = null }) {
  const changes = role ? "role = $4" : "status = $4";
  const value = role || status;
  const result = await pool.query(
    `UPDATE business_members SET ${changes}
     WHERE id = $1 AND business_id = $2 AND user_id <> $3
       AND role IN ('manager', 'viewer') AND status <> 'removed'
     RETURNING id`,
    [membershipId, businessId, actorUserId, value]
  );
  return result.rows[0];
}

export async function findInvitationByHash(tokenHash) {
  const result = await pool.query(
    `SELECT invitations.id, invitations.business_id, invitations.email_normalized,
            invitations.offered_role, invitations.status, invitations.expires_at,
            invitations.token_hash, businesses.name AS business_name, businesses.status AS business_status
     FROM business_invitations invitations
     INNER JOIN businesses ON businesses.id = invitations.business_id
     WHERE invitations.token_hash = $1`,
    [tokenHash]
  );
  return result.rows[0];
}

async function acceptInvitationTransaction({ tokenHash, userId, email, expirePending }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (expirePending) {
      await client.query(
        `UPDATE business_invitations SET status = 'expired'
         WHERE status = 'pending' AND expires_at <= CURRENT_TIMESTAMP`
      );
    }
    const invitationResult = await client.query(
      `SELECT id, business_id, email_normalized, offered_role, status, expires_at
       FROM business_invitations WHERE token_hash = $1 FOR UPDATE`, [tokenHash]
    );
    const invitation = invitationResult.rows[0];
    if (!invitation || invitation.status !== "pending") {
      await client.query("ROLLBACK");
      return { error: "not_found" };
    }
    const expiration = await client.query(
      "SELECT $1::timestamptz <= CURRENT_TIMESTAMP AS is_expired",
      [invitation.expires_at]
    );
    if (expiration.rows[0].is_expired) {
      await client.query("ROLLBACK");
      return { error: "expired" };
    }
    if (normalizeEmail(invitation.email_normalized) !== normalizeEmail(email)) {
      await client.query("ROLLBACK");
      return { error: "email_mismatch" };
    }
    const businessResult = await client.query(
      `SELECT id FROM businesses WHERE id = $1 AND status = 'active' FOR KEY SHARE`,
      [invitation.business_id]
    );
    if (!businessResult.rows[0]) { await client.query("ROLLBACK"); return { error: "not_found" }; }
    const membershipResult = await client.query(
      `INSERT INTO business_members (business_id, user_id, role, status, joined_at)
       VALUES ($1, $2, $3, 'active', CURRENT_TIMESTAMP)
       ON CONFLICT (business_id, user_id) DO UPDATE
       SET role = EXCLUDED.role, status = 'active', joined_at = CURRENT_TIMESTAMP
       WHERE business_members.role IN ('manager', 'viewer')
       RETURNING id`,
      [invitation.business_id, userId, invitation.offered_role]
    );
    if (!membershipResult.rows[0]) { await client.query("ROLLBACK"); return { error: "not_found" }; }
    const accepted = await client.query(
      `UPDATE business_invitations SET status = 'accepted', accepted_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND status = 'pending' RETURNING id, business_id, email_normalized`, [invitation.id]
    );
    if (!accepted.rows[0]) { await client.query("ROLLBACK"); return { error: "not_found" }; }
    await client.query("COMMIT");
    return { accepted: accepted.rows[0], membership: membershipResult.rows[0] };
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}

export async function acceptBusinessInvitation({ tokenHash, userId, email }) {
  const result = await acceptInvitationTransaction({ tokenHash, userId, email, expirePending: true });
  return result.accepted ?? null;
}

// La API necesita distinguir estados sin exponer detalles internos; la transacción es la misma
// que usa EJS, pero no expira otras invitaciones durante una consulta de aceptación puntual.
export async function acceptBusinessInvitationDetailed({ tokenHash, userId, email }) {
  return acceptInvitationTransaction({ tokenHash, userId, email, expirePending: false });
}
