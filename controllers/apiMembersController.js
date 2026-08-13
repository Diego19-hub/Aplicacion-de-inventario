import {
  getApiBusinessInvitations,
  getApiBusinessMembers,
  getApiBusinessMemberSummary
} from "../db/apiMemberQueries.js";
import { updateApiBusinessMember } from "../db/apiMemberQueries.js";
import { matchedData, validationResult } from "express-validator";

export function serializeMember(member, currentUserId) {
  return {
    id: Number(member.id),
    user: {
      id: Number(member.user_id),
      username: member.username,
      email: member.email
    },
    role: member.role,
    status: member.status,
    joinedAt: member.joined_at,
    createdAt: member.created_at,
    isCurrentUser: Number(member.user_id) === Number(currentUserId)
  };
}

function validationError(res, errors) {
  return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Revisa los campos enviados.", fields: errors.map((error) => ({ field: error.path, message: error.msg })) } });
}

const errorResponses = {
  not_found: [404, "MEMBER_NOT_FOUND", "No se encontró el miembro solicitado."],
  owner_protected: [409, "OWNER_PROTECTED", "La membresía propietaria no puede modificarse."],
  role_unchanged: [409, "MEMBER_ROLE_UNCHANGED", "El miembro ya tiene ese rol."],
  already_suspended: [409, "MEMBER_ALREADY_SUSPENDED", "El miembro ya está suspendido."],
  already_active: [409, "MEMBER_ALREADY_ACTIVE", "El miembro ya está activo."],
  already_removed: [409, "MEMBER_ALREADY_REMOVED", "El miembro ya fue removido."],
  state_incompatible: [409, "MEMBER_STATE_INCOMPATIBLE", "La transición no es válida para el estado actual."]
};

async function mutateMember(req, res, next, action) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return validationError(res, errors.array());
  const { role } = matchedData(req);
  try {
    const result = await updateApiBusinessMember({ businessId: req.business.id, membershipId: Number(req.params.membershipId), action, role });
    if (result.error) {
      const [status, code, message] = errorResponses[result.error];
      return res.status(status).json({ error: { code, message } });
    }
    return res.status(200).json({ data: { member: serializeMember(result.member, req.session.user.id) } });
  } catch (error) { return next(error); }
}

function serializeInvitation(invitation) {
  return {
    id: Number(invitation.id),
    email: invitation.email_normalized,
    offeredRole: invitation.offered_role,
    status: invitation.status,
    expiresAt: invitation.expires_at,
    createdAt: invitation.created_at,
    acceptedAt: invitation.accepted_at,
    isExpired: invitation.is_expired,
    invitedBy: {
      id: Number(invitation.invited_by_id),
      username: invitation.invited_by_username
    }
  };
}

export async function getMembers(req, res, next) {
  try {
    const [members, invitations, summary] = await Promise.all([
      getApiBusinessMembers(req.business.id),
      getApiBusinessInvitations(req.business.id),
      getApiBusinessMemberSummary(req.business.id)
    ]);

    return res.status(200).json({
      data: {
        members: members.map((member) => serializeMember(member, req.session.user.id)),
        invitations: invitations.map(serializeInvitation),
        summary: {
          activeMembers: Number(summary.active_members),
          pendingInvitations: Number(summary.pending_invitations)
        }
      }
    });
  } catch (error) {
    return next(error);
  }
}

export const changeApiMemberRole = (req, res, next) => mutateMember(req, res, next, "role");
export const suspendApiMember = (req, res, next) => mutateMember(req, res, next, "suspend");
export const reactivateApiMember = (req, res, next) => mutateMember(req, res, next, "reactivate");
export const removeApiMember = (req, res, next) => mutateMember(req, res, next, "remove");
