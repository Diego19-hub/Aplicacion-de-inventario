import { Router } from "express";
import { acceptInvitation, showInvitation } from "../controllers/invitationsController.js";
import { requireAuth } from "../middleware/authMiddleware.js";
import { invitationLimiter } from "../middleware/securityMiddleware.js";

const invitationsRouter = Router();
invitationsRouter.get("/:token", invitationLimiter, showInvitation);
invitationsRouter.post("/:token/accept", invitationLimiter, requireAuth, acceptInvitation);
export default invitationsRouter;
