import crypto from "crypto";

export function createInvitationToken() {
  const token = crypto.randomBytes(32).toString("hex");
  return { token, tokenHash: hashInvitationToken(token) };
}

export function hashInvitationToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}
