import "../config/env.js";

import {
  authorizationCodeGrant,
  buildAuthorizationUrl,
  calculatePKCECodeChallenge,
  discovery,
  randomNonce,
  randomPKCECodeVerifier,
  randomState
} from "openid-client";

import { normalizeEmail } from "../utils/email.js";

const GOOGLE_ISSUER = "https://accounts.google.com";
let configurationPromise;

function googleConfiguration() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  const callbackUrl = process.env.GOOGLE_CALLBACK_URL?.trim();
  if (!clientId || !clientSecret || !callbackUrl) {
    const error = new Error("Google OAuth no está configurado.");
    error.code = "GOOGLE_NOT_CONFIGURED";
    throw error;
  }
  if (!configurationPromise) {
    configurationPromise = discovery(new URL(GOOGLE_ISSUER), clientId, clientSecret);
  }
  return configurationPromise;
}

export async function createGoogleAuthorizationRequest() {
  const configuration = await googleConfiguration();
  const state = randomState();
  const nonce = randomNonce();
  const codeVerifier = randomPKCECodeVerifier();
  const codeChallenge = await calculatePKCECodeChallenge(codeVerifier);
  const url = buildAuthorizationUrl(configuration, {
    redirect_uri: process.env.GOOGLE_CALLBACK_URL.trim(),
    scope: "openid email profile",
    response_type: "code",
    state,
    nonce,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    prompt: "select_account"
  });
  return { url, state, nonce, codeVerifier };
}

export async function exchangeGoogleCode(callbackUrl, checks) {
  const configuration = await googleConfiguration();
  if (configuration.serverMetadata().issuer !== GOOGLE_ISSUER && configuration.serverMetadata().issuer !== "https://accounts.google.com/") {
    const error = new Error("El emisor de Google no es válido.");
    error.code = "GOOGLE_INVALID_ISSUER";
    throw error;
  }
  const tokens = await authorizationCodeGrant(configuration, callbackUrl, {
    pkceCodeVerifier: checks.codeVerifier,
    expectedState: checks.state,
    expectedNonce: checks.nonce,
    idTokenExpected: true
  });
  const claims = tokens.claims();
  if (!claims?.sub || !claims.email || claims.email_verified !== true) {
    const error = new Error("La cuenta de Google no tiene un correo verificado.");
    error.code = "GOOGLE_EMAIL_NOT_VERIFIED";
    throw error;
  }
  if (claims.iss !== GOOGLE_ISSUER && claims.iss !== "https://accounts.google.com/") {
    const error = new Error("El emisor del token no es válido.");
    error.code = "GOOGLE_INVALID_ISSUER";
    throw error;
  }
  const clientId = process.env.GOOGLE_CLIENT_ID.trim();
  if (claims.aud !== clientId && !(Array.isArray(claims.aud) && claims.aud.includes(clientId))) {
    const error = new Error("La audiencia del token no es válida.");
    error.code = "GOOGLE_INVALID_AUDIENCE";
    throw error;
  }
  return { subject: claims.sub, email: normalizeEmail(claims.email) };
}
