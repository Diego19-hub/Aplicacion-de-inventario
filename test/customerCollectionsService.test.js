import assert from "node:assert/strict";
import test from "node:test";
import { accountTotals, chargeState } from "../services/customerCollectionsService.js";

test("calcula saldo sin contar pagos cancelados", () => {
  assert.deepEqual(accountTotals([{ amount: "100", status: "pending" }, { amount: "50", status: "cancelled" }], [{ amount: "25", status: "active" }, { amount: "90", status: "cancelled" }]), { totalCharges: 100, totalPaid: 25, balance: 75 });
});
test("marca cargo parcial, pagado, vencido y cancelado", () => {
  assert.equal(chargeState({ amount: 100, paid: 20, dueDate: "2999-01-01", status: "pending" }), "partially_paid");
  assert.equal(chargeState({ amount: 100, paid: 100, dueDate: "2000-01-01", status: "pending" }), "paid");
  assert.equal(chargeState({ amount: 100, paid: 0, dueDate: "2000-01-01", status: "pending" }), "overdue");
  assert.equal(chargeState({ amount: 100, paid: 0, dueDate: "2000-01-01", status: "cancelled" }), "cancelled");
});
