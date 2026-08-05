import { Router } from "express";
import { requireActiveBusiness, requireBusinessRole } from "../middleware/authMiddleware.js";
import { invitationActionValidation, invitationValidation, memberActionValidation, memberRoleValidation } from "../middleware/memberValidation.js";
import { changeMemberRole, createInvitation, reactivateMember, removeMember, revokeInvitation, showMembers, suspendMember } from "../controllers/membersController.js";

const membersRouter = Router();
membersRouter.use(requireActiveBusiness, requireBusinessRole("owner"));
membersRouter.get("/", showMembers);
membersRouter.post("/invitations", invitationValidation, createInvitation);
membersRouter.post("/invitations/:invitationId/revoke", invitationActionValidation, revokeInvitation);
membersRouter.post("/:membershipId/role", memberRoleValidation, changeMemberRole);
membersRouter.post("/:membershipId/suspend", memberActionValidation, suspendMember);
membersRouter.post("/:membershipId/reactivate", memberActionValidation, reactivateMember);
membersRouter.post("/:membershipId/remove", memberActionValidation, removeMember);
export default membersRouter;
