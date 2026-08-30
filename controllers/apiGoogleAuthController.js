import { frontendPath } from "../config/env.js";
import { getActiveBusinessesForUser } from "../db/businessQueries.js";
import { createGoogleUser, findUserByEmail, findUserByProviderSubject, findUserByUsername, linkGoogleIdentity } from "../db/authQueries.js";
import { establishAuthenticatedSession } from "../services/authenticationService.js";
import { createGoogleAuthorizationRequest, exchangeGoogleCode } from "../services/googleOidcService.js";
import { isSafeReturnTo } from "../middleware/authMiddleware.js";

function saveSession(req) {
  return new Promise((resolve, reject) => req.session.save((error) => error ? reject(error) : resolve()));
}

function oauthErrorRedirect(req, code, returnTo = null) {
  const allowed = new Set(["GOOGLE_NOT_CONFIGURED", "GOOGLE_CANCELLED", "GOOGLE_INVALID_STATE", "GOOGLE_EMAIL_NOT_VERIFIED", "GOOGLE_ACCOUNT_CONFLICT", "GOOGLE_INVALID_TOKEN", "GOOGLE_SCHEMA_NOT_READY"]);
  const params = new URLSearchParams({ oauthError: allowed.has(code) ? code : "GOOGLE_INVALID_TOKEN" });
  if (isSafeReturnTo(returnTo)) params.set("returnTo", returnTo);
  return req.res.redirect(frontendPath(`/login?${params.toString()}`));
}

function logGoogleCallbackError(error) {
  if (process.env.NODE_ENV !== "development") return;

  console.error("[google-oauth/callback]", {
    code: error?.code,
    message: error?.message,
    constraint: error?.constraint,
    detail: error?.detail
  });
}

function generatedUsername(email) {
  const base = email.split("@")[0].toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 24) || "googleuser";
  return base;
}

async function uniqueUsername(email) {
  const base = generatedUsername(email);
  if (!await findUserByUsername(base)) return base;
  for (let suffix = 2; suffix < 10000; suffix += 1) {
    const candidate = `${base.slice(0, 29 - String(suffix).length)}${suffix}`;
    if (!await findUserByUsername(candidate)) return candidate;
  }
  throw Object.assign(new Error("No fue posible generar un usuario."), { code: "GOOGLE_ACCOUNT_CONFLICT" });
}

export async function startGoogleAuth(req, res, next) {
  try {
    const request = await createGoogleAuthorizationRequest();
    const returnTo = isSafeReturnTo(req.query.returnTo) ? req.query.returnTo : null;
    req.session.googleOAuth = { state: request.state, nonce: request.nonce, codeVerifier: request.codeVerifier, returnTo };
    await saveSession(req);
    if (process.env.NODE_ENV !== "test") console.info("[GOOGLE OAUTH INVITATION]", { tokenPreserved: Boolean(returnTo?.startsWith("/invitations/")), redirectPath: returnTo });
    return res.redirect(request.url.href);
  } catch (error) {
    if (error.code === "GOOGLE_NOT_CONFIGURED") return oauthErrorRedirect(req, error.code, req.query.returnTo);
    return next(error);
  }
}

export async function googleCallback(req, res, next) {
  const oauthSession = req.session.googleOAuth;
  delete req.session.googleOAuth;
  const returnTo = isSafeReturnTo(oauthSession?.returnTo) ? oauthSession.returnTo : null;
  if (req.query.error === "access_denied") return oauthErrorRedirect(req, "GOOGLE_CANCELLED", returnTo);
  if (!oauthSession || typeof req.query.code !== "string" || typeof req.query.state !== "string" || req.query.state !== oauthSession.state) return oauthErrorRedirect(req, "GOOGLE_INVALID_STATE", returnTo);
  try {
    const google = await exchangeGoogleCode(new URL(req.originalUrl, process.env.GOOGLE_CALLBACK_URL), oauthSession);
    let user = await findUserByProviderSubject("google", google.subject);
    if (!user) {
      user = await findUserByEmail(google.email);
      if (user) {
        const linked = await findUserByProviderSubject("google", google.subject);
        if (linked && linked.id !== user.id) return oauthErrorRedirect(req, "GOOGLE_ACCOUNT_CONFLICT", returnTo);
        user = await linkGoogleIdentity(user.id, google.subject);
      } else {
        user = await createGoogleUser({ username: await uniqueUsername(google.email), email: google.email, providerSubject: google.subject });
      }
    }
    const businesses = await getActiveBusinessesForUser(user.id);
    const activeBusinessId = businesses.length === 1 ? businesses[0].id : null;
    await establishAuthenticatedSession(req, user, { activeBusinessId, returnTo });
    const redirectPath = returnTo || (businesses.length === 1 ? "/app" : "/select-business");
    if (process.env.NODE_ENV !== "test") console.info("[GOOGLE OAUTH INVITATION]", { authenticatedUserId: user.id, authenticatedEmail: user.email, tokenPreserved: Boolean(returnTo?.startsWith("/invitations/")), redirectPath });
    return res.redirect(frontendPath(redirectPath));
  } catch (error) {
    logGoogleCallbackError(error);
    if (["GOOGLE_INVALID_STATE", "GOOGLE_EMAIL_NOT_VERIFIED", "GOOGLE_INVALID_ISSUER", "GOOGLE_INVALID_AUDIENCE", "AuthorizationResponseError", "ResponseBodyError"].includes(error.code) || error.name === "AuthorizationResponseError") return oauthErrorRedirect(req, error.code === "GOOGLE_EMAIL_NOT_VERIFIED" ? error.code : "GOOGLE_INVALID_TOKEN", returnTo);
    if (error.code === "23505") return oauthErrorRedirect(req, "GOOGLE_ACCOUNT_CONFLICT", returnTo);
    if (error.code === "42703" || error.code === "42P01") return oauthErrorRedirect(req, "GOOGLE_SCHEMA_NOT_READY", returnTo);
    return next(error);
  }
}
