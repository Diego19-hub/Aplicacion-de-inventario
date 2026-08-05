import crypto from "crypto";
import { matchedData, validationResult } from "express-validator";
import AppError from "../utils/AppError.js";
import {
  createBusinessInvitation,
  expirePendingInvitations,
  getBusinessInvitations,
  getBusinessMembers,
  revokeBusinessInvitation,
  updateBusinessMember
} from "../db/memberQueries.js";

function baseUrl(req) {
  const configured = process.env.APP_BASE_URL;
  if (configured) {
    try { return new URL(configured).origin; } catch { throw new AppError("APP_BASE_URL no es una URL válida.", 500); }
  }
  return `${req.protocol}://${req.get("host")}`;
}

export async function showMembers(req, res, next) {
  try {
    await expirePendingInvitations(req.business.id);
    const [members, invitations] = await Promise.all([
      getBusinessMembers(req.business.id), getBusinessInvitations(req.business.id)
    ]);
    res.render("members/index", { title: "Miembros", members, invitations, errors: [], formData: { email: "", role: "viewer" }, invitationLink: null });
  } catch (error) { next(error); }
}

export async function createInvitation(req, res, next) {
  const validationErrors = validationResult(req);
  if (!validationErrors.isEmpty()) {
    try {
      await expirePendingInvitations(req.business.id);
      const [members, invitations] = await Promise.all([getBusinessMembers(req.business.id), getBusinessInvitations(req.business.id)]);
      return res.status(400).render("members/index", { title: "Miembros", members, invitations, errors: validationErrors.array(), formData: { email: req.body.email ?? "", role: req.body.role ?? "viewer" }, invitationLink: null });
    } catch (error) { return next(error); }
  }
  const { email, role } = matchedData(req);
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  try {
    const invitation = await createBusinessInvitation({ businessId: req.business.id, email, role, invitedBy: req.session.user.id, tokenHash });
    const [members, invitations] = await Promise.all([getBusinessMembers(req.business.id), getBusinessInvitations(req.business.id)]);
    res.status(201).render("members/index", {
      title: "Miembros", members, invitations, errors: [], formData: { email: "", role: "viewer" },
      invitationLink: `${baseUrl(req)}/invitations/${token}`,
      createdInvitation: invitation
    });
  } catch (error) { next(error); }
}

async function performMemberUpdate(req, res, next, change) {
  const validationErrors = validationResult(req);
  if (!validationErrors.isEmpty()) return next(new AppError(validationErrors.array()[0].msg, 400));
  try {
    const member = await updateBusinessMember({ businessId: req.business.id, membershipId: Number(req.params.membershipId), actorUserId: req.session.user.id, ...change });
    if (!member) return next(new AppError("No se encontró el miembro solicitado.", 404));
    res.redirect("/members");
  } catch (error) { next(error); }
}

export const changeMemberRole = (req, res, next) => performMemberUpdate(req, res, next, { role: req.body.role });
export const suspendMember = (req, res, next) => performMemberUpdate(req, res, next, { status: "suspended" });
export const reactivateMember = (req, res, next) => performMemberUpdate(req, res, next, { status: "active" });
export const removeMember = (req, res, next) => performMemberUpdate(req, res, next, { status: "removed" });

export async function revokeInvitation(req, res, next) {
  const validationErrors = validationResult(req);
  if (!validationErrors.isEmpty()) return next(new AppError(validationErrors.array()[0].msg, 400));
  try {
    const invitation = await revokeBusinessInvitation(req.business.id, Number(req.params.invitationId));
    if (!invitation) return next(new AppError("No se encontró la invitación solicitada.", 404));
    res.redirect("/members");
  } catch (error) { next(error); }
}
