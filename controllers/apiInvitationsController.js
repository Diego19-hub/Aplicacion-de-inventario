import { matchedData, validationResult } from "express-validator";

import {
  createApiBusinessInvitation,
  getApiBusinessInvitationById,
  revokeApiBusinessInvitation
} from "../db/apiMemberQueries.js";
import { createInvitationToken } from "../utils/invitationToken.js";

function validationError(res, errors) {
  return res.status(400).json({
    error: {
      code: "VALIDATION_ERROR",
      message: "Revisa los campos enviados.",
      fields: errors.map((error) => ({ field: error.path, message: error.msg }))
    }
  });
}

function serializeInvitation(invitation) {
  return {
    id: Number(invitation.id),
    email: invitation.email_normalized,
    offeredRole: invitation.offered_role,
    status: invitation.status,
    expiresAt: invitation.expires_at,
    createdAt: invitation.created_at,
    acceptedAt: invitation.accepted_at
  };
}

function invitationNotFound(res) {
  return res.status(404).json({
    error: {
      code: "INVITATION_NOT_FOUND",
      message: "No se encontró la invitación solicitada."
    }
  });
}

export async function createInvitation(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return validationError(res, errors.array());

  const { email, offeredRole } = matchedData(req);
  const { token, tokenHash } = createInvitationToken();
  try {
    const result = await createApiBusinessInvitation({
      businessId: req.business.id,
      email,
      offeredRole,
      invitedBy: req.session.user.id,
      tokenHash
    });
    if (result.error === "already_active_member") {
      return res.status(409).json({
        error: {
          code: "INVITATION_MEMBER_ALREADY_ACTIVE",
          message: "Este correo ya pertenece a un miembro activo del negocio."
        }
      });
    }
    return res.status(201).json({
      data: {
        invitation: serializeInvitation(result.invitation),
        acceptancePath: `/invitations/${token}`
      }
    });
  } catch (error) {
    return next(error);
  }
}

export async function revokeInvitation(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return validationError(res, errors.array());

  const invitationId = Number(req.params.invitationId);
  try {
    const invitation = await revokeApiBusinessInvitation(req.business.id, invitationId);
    if (invitation) return res.status(200).json({ data: { invitation: serializeInvitation(invitation) } });

    const existingInvitation = await getApiBusinessInvitationById(req.business.id, invitationId);
    if (!existingInvitation) return invitationNotFound(res);
    return res.status(409).json({
      error: {
        code: "INVITATION_NOT_PENDING",
        message: "La invitación ya no puede revocarse."
      }
    });
  } catch (error) {
    return next(error);
  }
}
