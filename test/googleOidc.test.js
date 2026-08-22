import test from "node:test";
import assert from "node:assert/strict";

import { createGoogleAuthorizationRequest } from "../services/googleOidcService.js";

test("Google OAuth rechaza configuración incompleta sin exponer secretos", async () => {
  const previous = {
    id: process.env.GOOGLE_CLIENT_ID,
    secret: process.env.GOOGLE_CLIENT_SECRET,
    callback: process.env.GOOGLE_CALLBACK_URL
  };
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_SECRET;
  delete process.env.GOOGLE_CALLBACK_URL;
  await assert.rejects(createGoogleAuthorizationRequest(), (error) => error.code === "GOOGLE_NOT_CONFIGURED");
  if (previous.id === undefined) delete process.env.GOOGLE_CLIENT_ID; else process.env.GOOGLE_CLIENT_ID = previous.id;
  if (previous.secret === undefined) delete process.env.GOOGLE_CLIENT_SECRET; else process.env.GOOGLE_CLIENT_SECRET = previous.secret;
  if (previous.callback === undefined) delete process.env.GOOGLE_CALLBACK_URL; else process.env.GOOGLE_CALLBACK_URL = previous.callback;
});
