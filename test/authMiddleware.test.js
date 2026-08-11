import test from "node:test";
import assert from "node:assert/strict";
import AppError from "../utils/AppError.js";
import {
  isSafeReturnTo,
  requireAuth,
  requireBusinessRole,
  requireSuperAdmin
} from "../middleware/authMiddleware.js";

function createResponse() {
  return {
    redirectedTo: null,
    redirect(path) {
      this.redirectedTo = path;
    }
  };
}

function createNext() {
  const calls = [];
  const next = (error) => calls.push(error);

  return { calls, next };
}

test("isSafeReturnTo acepta una ruta interna", () => {
  assert.equal(isSafeReturnTo("/items?page=2"), true);
});

test("isSafeReturnTo rechaza una URL externa", () => {
  assert.equal(isSafeReturnTo("https://example.com/items"), false);
});

test("isSafeReturnTo rechaza rutas que comienzan con //", () => {
  assert.equal(isSafeReturnTo("//example.com/items"), false);
});

test("isSafeReturnTo rechaza rutas con barras invertidas", () => {
  assert.equal(isSafeReturnTo("/items\\edit"), false);
});

test("isSafeReturnTo rechaza valores que no son texto", () => {
  for (const value of [null, undefined, 1, {}, []]) {
    assert.equal(isSafeReturnTo(value), false);
  }
});

test("requireAuth permite a un usuario autenticado", () => {
  const req = { session: { user: { id: 1 } } };
  const res = createResponse();
  const { calls, next } = createNext();

  requireAuth(req, res, next);

  assert.deepEqual(calls, [undefined]);
  assert.equal(res.redirectedTo, null);
});

test("requireAuth guarda una ruta GET segura y redirige al login", () => {
  const req = {
    method: "GET",
    originalUrl: "/items?page=2",
    session: {
      save(callback) {
        callback();
      }
    }
  };
  const res = createResponse();
  const { calls, next } = createNext();

  requireAuth(req, res, next);

  assert.equal(req.session.returnTo, "/items?page=2");
  assert.deepEqual(calls, []);
  assert.equal(res.redirectedTo, "/auth/login");
});

test("requireAuth guarda / para una solicitud POST anónima", () => {
  const req = {
    method: "POST",
    originalUrl: "/items/1/edit",
    session: {
      save(callback) {
        callback();
      }
    }
  };
  const res = createResponse();
  const { next } = createNext();

  requireAuth(req, res, next);

  assert.equal(req.session.returnTo, "/");
  assert.equal(res.redirectedTo, "/auth/login");
});

test("requireAuth guarda / para una URL insegura", () => {
  const req = {
    method: "GET",
    originalUrl: "//example.com",
    session: {
      save(callback) {
        callback();
      }
    }
  };
  const res = createResponse();
  const { next } = createNext();

  requireAuth(req, res, next);

  assert.equal(req.session.returnTo, "/");
  assert.equal(res.redirectedTo, "/auth/login");
});

test("requireAuth entrega el error de session.save sin redirigir", () => {
  const saveError = new Error("No se pudo guardar la sesión");
  const req = {
    method: "GET",
    originalUrl: "/items",
    session: {
      save(callback) {
        callback(saveError);
      }
    }
  };
  const res = createResponse();
  const { calls, next } = createNext();

  requireAuth(req, res, next);

  assert.deepEqual(calls, [saveError]);
  assert.equal(res.redirectedTo, null);
});

test("requireSuperAdmin permite al superadministrador", () => {
  const req = { session: { user: { platformRole: "super_admin" } } };
  const { calls, next } = createNext();

  requireSuperAdmin(req, createResponse(), next);

  assert.deepEqual(calls, [undefined]);
});

for (const description of ["un usuario normal", "una sesión anónima"]) {
  test(`requireSuperAdmin rechaza ${description}`, () => {
    const req = description === "un usuario normal"
      ? { session: { user: { platformRole: "user" } } }
      : { session: {} };
    const { calls, next } = createNext();

    requireSuperAdmin(req, createResponse(), next);

    assert.equal(calls.length, 1);
    assert.ok(calls[0] instanceof AppError);
    assert.equal(calls[0].statusCode, 403);
  });
}

for (const role of ["owner", "manager"]) {
  test(`requireBusinessRole permite ${role}`, () => {
    const req = { membership: { role } };
    const { calls, next } = createNext();

    requireBusinessRole("owner", "manager")(req, createResponse(), next);

    assert.deepEqual(calls, [undefined]);
  });
}

test("requireBusinessRole rechaza viewer con 403", () => {
  const req = { membership: { role: "viewer" } };
  const { calls, next } = createNext();

  requireBusinessRole("owner", "manager")(req, createResponse(), next);

  assert.equal(calls.length, 1);
  assert.ok(calls[0] instanceof AppError);
  assert.equal(calls[0].statusCode, 403);
});

test("requireBusinessRole rechaza la ausencia de membresía con 403", () => {
  const { calls, next } = createNext();

  requireBusinessRole("owner", "manager")({}, createResponse(), next);

  assert.equal(calls.length, 1);
  assert.ok(calls[0] instanceof AppError);
  assert.equal(calls[0].statusCode, 403);
});

test("requireBusinessRole permite viewer cuando se autoriza explícitamente", () => {
  const req = { membership: { role: "viewer" } };
  const { calls, next } = createNext();

  requireBusinessRole("owner", "manager", "viewer")(req, createResponse(), next);

  assert.deepEqual(calls, [undefined]);
});
