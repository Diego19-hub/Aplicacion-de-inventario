import assert from "node:assert/strict";
import test from "node:test";

import { createScopedLimiter } from "../middleware/securityMiddleware.js";

test("los límites específicos permiten una petición y después responden 429", async () => {
  const limiter = createScopedLimiter(1, "Límite de prueba alcanzado.");
  const makeRequest = () => ({
    method: "GET",
    ip: "127.0.0.1",
    headers: {},
    socket: { remoteAddress: "127.0.0.1" },
    app: { get: () => false }
  });
  const responseData = {
    headers: {},
    statusCode: 200,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    append(name, value) { this.headers[name.toLowerCase()] = value; },
    getHeader(name) { return this.headers[name.toLowerCase()]; },
    removeHeader(name) { delete this.headers[name.toLowerCase()]; },
    status(code) { this.statusCode = code; return this; },
    send(body) { this.body = body; },
    end() {}
  };
  const firstNext = () => {};
  const secondNext = (error) => { responseData.error = error; };

  await limiter(makeRequest(), responseData, firstNext);
  await limiter(makeRequest(), responseData, secondNext);

  assert.equal(responseData.error.statusCode, 429);
  assert.equal(responseData.error.message, "Límite de prueba alcanzado.");
  assert.match(String(responseData.headers.ratelimit), /1-in-15min/);
});
