import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const envFile = path.join(projectRoot, ".env");

// Cargar siempre la configuración desde la raíz del proyecto, sin depender
// del directorio desde el que se inició el proceso.
dotenv.config({ path: envFile });

export function googleOAuthConfigStatus() {
  return {
    clientIdConfigured: Boolean(process.env.GOOGLE_CLIENT_ID?.trim()),
    clientSecretConfigured: Boolean(process.env.GOOGLE_CLIENT_SECRET?.trim()),
    callbackConfigured: Boolean(process.env.GOOGLE_CALLBACK_URL?.trim())
  };
}

export function getFrontendUrl() {
  const configuredUrl = process.env.FRONTEND_URL?.trim();
  if (configuredUrl) return configuredUrl.replace(/\/+$/, "");
  if (process.env.NODE_ENV === "production") return null;
  return "http://localhost:5173";
}

export function frontendPath(pathname) {
  const frontendUrl = getFrontendUrl();
  return frontendUrl ? new URL(pathname, `${frontendUrl}/`).toString() : pathname;
}

export { envFile, projectRoot };
