import { apiCredentials, apiUrl } from "./config.js";

export class ApiError extends Error {
  constructor({ code = "INTERNAL_ERROR", message = "Ocurrió un error interno.", fields = [], status } = {}) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.fields = fields;
    this.status = status;
  }
}

async function parseResponse(response) {
  if (response.status === 204) return null;

  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    return null;
  }

  return response.json();
}

async function csrfToken() {
  const response = await fetch(apiUrl("/csrf-token"), {
    credentials: apiCredentials
  });
  const payload = await parseResponse(response);

  if (!response.ok || !payload?.data?.csrfToken) {
    throw new ApiError(payload?.error);
  }

  return payload.data.csrfToken;
}

const memoryCache = new Map();
const CACHE_TTL_MS = 1500;
const cacheablePaths = [/^\/session$/, /^\/categories(?:\/|\?|$)/, /^\/locations(?:\/|\?|$)/, /^\/suppliers(?:\/|\?|$)/];

function isCacheable(path, method) {
  return method === "GET" && cacheablePaths.some((pattern) => pattern.test(path));
}

function invalidateCache() {
  memoryCache.clear();
}

function notifyUnauthorized() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("api:unauthorized"));
  }
}

function logRequestFailure(path, status, response) {
  if (import.meta.env.DEV || import.meta.env.VITE_API_DEBUG === "true") {
    // Solo se registra el error JSON del servidor; nunca request headers/body.
    console.warn("[api-request]", {
      url: apiUrl(path),
      status,
      response: response?.error ?? response ?? null
    });
  }
}

export async function apiRequest(path, { method = "GET", body, csrf = false, signal } = {}) {
  const normalizedMethod = method.toUpperCase();
  if (isCacheable(path, normalizedMethod)) {
    const cached = memoryCache.get(path);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    memoryCache.delete(path);
  }
  const headers = {
    Accept: "application/json"
  };

  if (body !== undefined && !(body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  if (csrf) {
    headers["X-CSRF-Token"] = await csrfToken();
  }

  const requestOptions = {
    method: normalizedMethod,
    headers,
    credentials: "same-origin",
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body)
  };
  if (signal !== undefined) requestOptions.signal = signal;
  requestOptions.credentials = apiCredentials;
  let response;
  try {
    response = await fetch(apiUrl(path), requestOptions);
  } catch (error) {
    logRequestFailure(path, null, { message: error.message });
    throw error;
  }
  const payload = await parseResponse(response);

  if (!response.ok) {
    logRequestFailure(path, response.status, payload);
    if (response.status === 401) {
      notifyUnauthorized();
    }

    throw new ApiError({ ...payload?.error, status: response.status });
  }

  const data = payload?.data ?? null;
  if (normalizedMethod === "GET" && isCacheable(path, normalizedMethod)) {
    memoryCache.set(path, { value: data, expiresAt: Date.now() + CACHE_TTL_MS });
  } else if (normalizedMethod !== "GET") {
    invalidateCache();
  }
  return data;
}
