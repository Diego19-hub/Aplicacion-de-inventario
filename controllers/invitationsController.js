import crypto from "crypto";
import AppError from "../utils/AppError.js";
import { acceptBusinessInvitation, expirePendingInvitations, findInvitationByHash } from "../db/memberQueries.js";
import { hashInvitationToken } from "../utils/invitationToken.js";

function tokenHash(token) {
  if (!/^[a-f0-9]{64}$/i.test(token)) return null;
  return hashInvitationToken(token);
}

function maskedEmail(email) {
  const [local, domain] = email.split("@");
  return `${local.slice(0, 1)}${"•".repeat(Math.max(2, local.length - 1))}@${domain}`;
}

function normalizedSessionEmail(req) {
  return String(req.session.user?.email ?? "").trim().toLowerCase();
}

async function getInvitation(token) {
  const hash = tokenHash(token);
  if (!hash) return null;
  await expirePendingInvitations();
  const invitation = await findInvitationByHash(hash);
  if (!invitation) return null;
  // Mantiene una comparación de tiempo constante aun cuando la consulta usa el índice único.
  if (!crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(invitation.token_hash, "hex"))) return null;
  return invitation;
}

export async function showInvitation(req, res, next) {
  try {
    const invitation = await getInvitation(req.params.token);
    if (!invitation) return next(new AppError("La invitación no existe.", 404));
    if (!req.session.user) req.session.returnTo = req.originalUrl;
    res.render("invitations/show", { title: "Invitación", invitation, requestToken: req.params.token, maskedEmail: maskedEmail(invitation.email_normalized), canAccept: Boolean(req.session.user) && normalizedSessionEmail(req) === invitation.email_normalized });
  } catch (error) { next(error); }
}

export async function acceptInvitation(req, res, next) {
  try {
    const hash = tokenHash(req.params.token);
    if (!hash) return next(new AppError("La invitación no existe.", 404));
    const invitation = await getInvitation(req.params.token);
    if (!invitation || invitation.status !== "pending" || invitation.business_status !== "active") return next(new AppError("Esta invitación ya no está disponible.", 409));
    const email = normalizedSessionEmail(req);
    if (email !== invitation.email_normalized) return next(new AppError("Esta invitación fue enviada a otro correo electrónico.", 403));
    const accepted = await acceptBusinessInvitation({ tokenHash: hash, userId: req.session.user.id, email });
    if (!accepted) return next(new AppError("Esta invitación ya no está disponible.", 409));
    req.session.activeBusinessId = accepted.business_id;
    req.session.save((error) => error ? next(error) : res.redirect("/"));
  } catch (error) { next(error); }
}
