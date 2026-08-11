import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";

process.env.NODE_ENV = "test";
process.env.SESSION_SECRET = "test-session-secret";

const { default: app } = await import("../app.js");

test("una ruta inexistente responde 404", async () => {
  const response = await request(app).get("/ruta-inexistente");

  assert.equal(response.status, 404);
});

test("la aplicación no expone x-powered-by", async () => {
  const response = await request(app).get("/ruta-inexistente");

  assert.equal(response.headers["x-powered-by"], undefined);
});

test("Helmet configura x-content-type-options", async () => {
  const response = await request(app).get("/ruta-inexistente");

  assert.equal(response.headers["x-content-type-options"], "nosniff");
});
