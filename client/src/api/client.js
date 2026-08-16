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

function notifyUnauthorized() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("api:unauthorized"));
  }
}

export async function apiRequest(path, { method = "GET", body, csrf = false } = {}) {
  const headers = {
    Accept: "application/json"
  };

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  if (csrf) {
    headers["X-CSRF-Token"] = await csrfToken();
  }

  const response = await fetch(`/api${path}`, {
    method,
    headers,
    credentials: "same-origin",
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const payload = await parseResponse(response);

  if (!response.ok) {
    if (response.status === 401) {
      notifyUnauthorized();
    }

    throw new ApiError({ ...payload?.error, status: response.status });
  }

  return payload?.data ?? null;
}
