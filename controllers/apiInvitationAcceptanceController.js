import crypto from "crypto";

import { findApiInvitationByHash } from "../db/apiMemberQueries.js";
import { getActiveBusinessesForUser, getActiveBusinessMembership } from "../db/businessQueries.js";
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
    const authenticatedUserId = req.session.user.id;
    const result = await acceptBusinessInvitationDetailed({
      tokenHash: hash,
      userId: authenticatedUserId,
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

    const invitationBusinessId = Number(result.accepted.business_id);
    const activeMembership = await getActiveBusinessMembership(authenticatedUserId, invitationBusinessId);
    if (!activeMembership) return invitationNotFound(res);

    const businesses = await getActiveBusinessesForUser(authenticatedUserId);
    const redirectPath = businesses.length === 1 ? "/app" : "/select-business";

    // activeBusinessId stores the business id (not the membership id); /session
    // resolves the membership and permissions from this value on every reload.
    req.session.activeBusinessId = invitationBusinessId;
    await saveSession(req);
    const membership = serializeMembership(activeMembership);

    if (process.env.NODE_ENV !== "test") {
      console.info("[INVITATION ACCEPTED]", {
        invitationId: result.accepted.id ?? null,
        invitationEmail: result.accepted.email_normalized,
        authenticatedUserId,
        authenticatedEmail: normalizedSessionEmail(req),
        tokenPreserved: true,
        invitationBusinessId,
        businessId: invitationBusinessId,
        membershipId: activeMembership.membership_id,
        insertedMembershipUserId: authenticatedUserId,
        insertedMembershipBusinessId: invitationBusinessId,
        membershipStatus: activeMembership.membership_status,
        membershipCreated: Boolean(result.membership?.id),
        activeBusinessId: req.session.activeBusinessId,
        businessesFound: businesses.map((business) => business.id),
        sessionUserId: req.session.user.id,
        redirectPath
      });
    }

    return res.status(200).json({
      data: {
        accepted: true,
        userId: authenticatedUserId,
        business: serializeActiveBusiness(activeMembership),
        businessId: invitationBusinessId,
        redirectPath,
        membershipId: activeMembership.membership_id,
        membership: { id: activeMembership.membership_id, ...membership },
        permissions: sessionPermissions(membership, req.session.user.platformRole)
      }
    });
  } catch (error) {
    return next(error);
  }
}
