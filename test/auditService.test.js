import test from "node:test";
import assert from "node:assert/strict";
import { auditService } from "../services/auditService.js";

test("auditService escribe usando el cliente transaccional y sanitiza secretos", async () => {
  const calls = [];
  const client = {
    async query(sql, values) {
      calls.push({ sql, values });
      return { rows: [{ id: 1 }] };
    }
  };

  await auditService.record({
    client,
    businessId: 7,
    userId: 11,
    module: "products",
    action: "edit",
    reference: "PRODUCT-1",
    description: "Producto editado",
    newValues: { name: "Chile", password: "no-debe-guardarse", nested: { token: "no-debe-guardarse" } }
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].values[0], 7);
  assert.equal(calls[0].values[1], 11);
  const serialized = calls[0].values[7];
  assert.match(serialized, /Chile/);
  assert.doesNotMatch(serialized, /password|token|no-debe-guardarse/);
});

test("auditService propaga el error para que la operación transaccional haga rollback", async () => {
  const expected = new Error("audit failed");
  const client = {
    async query() {
      throw expected;
    }
  };

  await assert.rejects(
    auditService.record({
      client,
      businessId: 7,
      module: "sales",
      action: "create",
      description: "Venta registrada"
    }),
    expected
  );
});
