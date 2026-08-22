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
  const response = await fetch("/api/csrf-token", {
    credentials: "same-origin"
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
  const response = await fetch(`/api${path}`, requestOptions);
  const payload = await parseResponse(response);

  if (!response.ok) {
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
