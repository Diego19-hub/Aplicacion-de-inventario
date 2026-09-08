import test from "node:test";
import assert from "node:assert/strict";
import { requireApiBusinessRole } from "../middleware/apiAuthorizationMiddleware.js";

test("la autorización del chat permite los tres roles de negocio", () => {
  for (const role of ["owner", "manager", "viewer"]) {
    let called = false;
    const result = requireApiBusinessRole("owner", "manager", "viewer")({ membership: { role } }, {}, () => { called = true; });
    assert.equal(result, undefined);
    assert.equal(called, true);
  }
});

test("la autorización del chat rechaza una membresía ausente o no permitida", () => {
  for (const membership of [undefined, { role: "other" }]) {
    let payload;
    const res = { status(code) { this.statusCode = code; return this; }, json(value) { payload = value; return value; } };
    requireApiBusinessRole("owner", "manager", "viewer")({ membership }, res, () => assert.fail("no debe continuar"));
    assert.equal(res.statusCode, 403);
    assert.equal(payload.error.code, "FORBIDDEN");
  }
});
