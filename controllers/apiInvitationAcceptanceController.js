import crypto from "crypto";

import { findApiInvitationByHash } from "../db/apiMemberQueries.js";
import { getActiveBusinessMembership } from "../db/businessQueries.js";
import { acceptBusinessInvitationDetailed } from "../db/memberQueries.js";
import { hashInvitationToken } from "../utils/invitationToken.js";
import {
  serializeActiveBusiness,
  serializeMembership,
  sessionPermissions
} from "./apiSessionController.js";

function tokenHash(token) {
  if (typeof token !== "string" || !/^[a-f0-9]{64}$/i.test(token)) return null;
  return hashInvitationToken(token);
}

function invitationNotFound(res) {
  return res.status(404).json({
    error: {
      code: "INVITATION_NOT_FOUND",
      message: "La invitación no existe o ya no está disponible."
    }
  });
}

function normalizedSessionEmail(req) {
  return String(req.session.user?.email ?? "").trim().toLowerCase();
}

function saveSession(req) {
  return new Promise((resolve, reject) => {
    req.session.save((error) => (error ? reject(error) : resolve()));
  });
}

function hasMatchingHash(hash, invitation) {
  return crypto.timingSafeEqual(
    Buffer.from(hash, "hex"),
    Buffer.from(invitation.token_hash, "hex")
  );
}

export async function getPublicInvitation(req, res, next) {
  const hash = tokenHash(req.params.token);
  if (!hash) return invitationNotFound(res);

  try {
    const invitation = await findApiInvitationByHash(hash);
    if (!invitation || invitation.status !== "pending" || invitation.business_status !== "active" || !hasMatchingHash(hash, invitation)) {
      return invitationNotFound(res);
    }

    const email = normalizedSessionEmail(req);
    return res.status(200).json({
      data: {
        invitation: {
          email: invitation.email_normalized,
          offeredRole: invitation.offered_role,
          status: invitation.status,
          expiresAt: invitation.expires_at,
          isExpired: invitation.is_expired,
          business: {
            name: invitation.business_name,
            slug: invitation.business_slug
          }
        },
        session: {
          authenticated: Boolean(req.session.user),
          emailMatches: Boolean(req.session.user) && email === invitation.email_normalized
        }
      }
    });
  } catch (error) {
    return next(error);
  }
}

export async function acceptPublicInvitation(req, res, next) {
  const hash = tokenHash(req.params.token);
  if (!hash) return invitationNotFound(res);

  try {
    const result = await acceptBusinessInvitationDetailed({
      tokenHash: hash,
      userId: req.session.user.id,
      email: normalizedSessionEmail(req)
    });

    if (result.error === "email_mismatch") {
      return res.status(403).json({
        error: {
          code: "INVITATION_EMAIL_MISMATCH",
          message: "Esta invitación fue enviada a otro correo electrónico."
        }
      });
    }
    if (result.error === "expired") {
      return res.status(410).json({
        error: {
          code: "INVITATION_EXPIRED",
          message: "Esta invitación venció y ya no puede aceptarse."
        }
      });
    }
    if (result.error) return invitationNotFound(res);

    const activeMembership = await getActiveBusinessMembership(req.session.user.id, result.accepted.business_id);
    if (!activeMembership) return invitationNotFound(res);

    req.session.activeBusinessId = activeMembership.id;
    await saveSession(req);
    const membership = serializeMembership(activeMembership);

    return res.status(200).json({
      data: {
        business: serializeActiveBusiness(activeMembership),
        membership: { id: activeMembership.membership_id, ...membership },
        permissions: sessionPermissions(membership, req.session.user.platformRole)
      }
    });
  } catch (error) {
    return next(error);
  }
}
