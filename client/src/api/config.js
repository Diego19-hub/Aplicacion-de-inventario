const configuredApiUrl = import.meta.env.VITE_API_URL?.trim() ?? "";

export const API_BASE_URL = configuredApiUrl.replace(/\/+$/, "");

export function apiUrl(path) {
  return `${API_BASE_URL}/api${path}`;
}

export const apiCredentials = API_BASE_URL ? "include" : "same-origin";
