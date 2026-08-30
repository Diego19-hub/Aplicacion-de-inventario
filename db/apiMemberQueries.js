import pool from "./pool.js";
import { auditService } from "../services/auditService.js";

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

export async function createApiBusinessInvitation({ businessId, email, offeredRole, invitedBy, tokenHash }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1, hashtext($2))", [businessId, email]);

    const activeMember = await client.query(
      `
        SELECT 1
        FROM business_members bm
        INNER JOIN users u ON u.id = bm.user_id
        WHERE bm.business_id = $1
          AND bm.status = 'active'
          AND LOWER(BTRIM(u.email)) = $2
        LIMIT 1
      `,
      [businessId, email]
    );
    if (activeMember.rows[0]) {
      await client.query("ROLLBACK");
      return { error: "already_active_member" };
    }

    // Las pendientes vencidas se marcan expired antes de sustituir una pendiente vigente.
    await client.query(
      `
        UPDATE business_invitations
        SET status = 'expired'
        WHERE business_id = $1
          AND status = 'pending'
          AND expires_at <= CURRENT_TIMESTAMP
      `,
      [businessId]
    );
    await client.query(
      `
        UPDATE business_invitations
        SET status = 'revoked'
        WHERE business_id = $1
          AND email_normalized = $2
          AND status = 'pending'
      `,
      [businessId, email]
    );
    const result = await client.query(
      `
        INSERT INTO business_invitations (
          business_id, email_normalized, offered_role, token_hash, invited_by, expires_at
        ) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP + INTERVAL '30 days')
        RETURNING id, email_normalized, offered_role, status, expires_at, created_at, accepted_at
      `,
      [businessId, email, offeredRole, tokenHash, invitedBy]
    );
    await auditService.record({ client, businessId, userId: invitedBy, module: "members", action: "create", reference: `INVITATION-${result.rows[0].id}`, description: "Invitación de miembro creada", newValues: { invitationId: result.rows[0].id, role: offeredRole } });
    await client.query("COMMIT");
    return { invitation: result.rows[0] };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function revokeApiBusinessInvitation(businessId, invitationId) {
  const result = await pool.query(
    `
      UPDATE business_invitations
      SET status = 'revoked'
      WHERE id = $1
        AND business_id = $2
        AND status = 'pending'
      RETURNING id, email_normalized, offered_role, status, expires_at, created_at, accepted_at
    `,
    [invitationId, businessId]
  );
  return result.rows[0] ?? null;
}

export async function getApiBusinessInvitationById(businessId, invitationId) {
  const result = await pool.query(
    `
      SELECT id, status
      FROM business_invitations
      WHERE business_id = $1
        AND id = $2
    `,
    [businessId, invitationId]
  );
  return result.rows[0] ?? null;
}

export async function findApiInvitationByHash(tokenHash) {
  const result = await pool.query(
    `
      SELECT
        bi.email_normalized,
        bi.offered_role,
        bi.status,
        bi.expires_at,
        bi.token_hash,
        b.name AS business_name,
        b.slug AS business_slug,
        b.status AS business_status,
        (bi.expires_at <= CURRENT_TIMESTAMP) AS is_expired
      FROM business_invitations bi
      INNER JOIN businesses b ON b.id = bi.business_id
      WHERE bi.token_hash = $1
    `,
    [tokenHash]
  );
  return result.rows[0] ?? null;
}

export async function updateApiBusinessMember({ businessId, membershipId, actorUserId, action, role = null }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const found = await client.query(
      `SELECT bm.id, bm.user_id, bm.role, bm.status, bm.joined_at, bm.created_at, u.username, u.email
       FROM business_members bm
       INNER JOIN users u ON u.id = bm.user_id
       WHERE bm.id = $1 AND bm.business_id = $2
       FOR UPDATE`,
      [membershipId, businessId]
    );
    const member = found.rows[0];
    if (!member) { await client.query("ROLLBACK"); return { error: "not_found" }; }
    const previousMember = { role: member.role, status: member.status };
    if (member.role === "owner") { await client.query("ROLLBACK"); return { error: "owner_protected" }; }

    if (action === "role") {
      if (!["active", "suspended"].includes(member.status)) {
        await client.query("ROLLBACK");
        return { error: "state_incompatible" };
      }
      if (member.role === role) { await client.query("ROLLBACK"); return { error: "role_unchanged" }; }
      await client.query("UPDATE business_members SET role = $1 WHERE id = $2 AND business_id = $3", [role, membershipId, businessId]);
      member.role = role;
    } else {
      const rules = {
        suspend: { next: "suspended", allowed: ["active"], repeated: "suspended", repeatedError: "already_suspended" },
        reactivate: { next: "active", allowed: ["suspended", "removed"], repeated: "active", repeatedError: "already_active" },
        remove: { next: "removed", allowed: ["active", "suspended"], repeated: "removed", repeatedError: "already_removed" }
      };
      const rule = rules[action];
      if (member.status === rule.repeated) { await client.query("ROLLBACK"); return { error: rule.repeatedError }; }
      if (!rule.allowed.includes(member.status)) { await client.query("ROLLBACK"); return { error: "state_incompatible" }; }
      await client.query("UPDATE business_members SET status = $1 WHERE id = $2 AND business_id = $3", [rule.next, membershipId, businessId]);
      member.status = rule.next;
    }
    await auditService.record({ client, businessId, userId: actorUserId, module: "members", action: action === "role" ? "change_permissions" : "change_status", reference: `MEMBER-${membershipId}`, description: action === "role" ? "Permisos del miembro actualizados" : "Estado del miembro actualizado", previousValues: previousMember, newValues: { role: member.role, status: member.status } });
    await client.query("COMMIT");
    return { member };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
