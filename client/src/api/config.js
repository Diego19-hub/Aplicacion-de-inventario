const configuredApiUrl = import.meta.env.VITE_API_URL?.trim() ?? "";
const tauriApiUrl = "https://inventario.saas.duob.tech";
const resolvedApiUrl = import.meta.env.MODE === "tauri"
  ? configuredApiUrl || tauriApiUrl
  : configuredApiUrl;

export const API_BASE_URL = resolvedApiUrl.replace(/\/+$/, "");

export function apiUrl(path) {
  return `${API_BASE_URL}/api${path}`;
}

export const apiCredentials = "include";
