import {
  getApiBusinessInvitations,
  getApiBusinessMembers,
  getApiBusinessMemberSummary
} from "../db/apiMemberQueries.js";

function serializeMember(member, currentUserId) {
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
