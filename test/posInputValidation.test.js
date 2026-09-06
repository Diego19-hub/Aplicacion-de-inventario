import assert from "node:assert/strict";
import test from "node:test";

import { cashPaymentError, validateSaleQuantity } from "../client/src/utils/posInputValidation.js";

test("POS valida cantidad cero, cantidad mayor al stock y cantidad válida", () => {
  assert.deepEqual(validateSaleQuantity("0", 3), {
    quantity: null,
    error: "La cantidad a vender debe ser al menos 1."
  });
  assert.deepEqual(validateSaleQuantity("10000", 3), {
    quantity: 3,
    error: "Solo hay 3 unidades disponibles para vender."
  });
  assert.deepEqual(validateSaleQuantity("2", 3), { quantity: 2, error: "" });
});

test("POS acepta efectivo exacto o superior y rechaza efectivo insuficiente", () => {
  assert.equal(cashPaymentError("3899.97", 3899.97), "");
  assert.equal(cashPaymentError("3899.96", 3899.97), "El efectivo recibido es insuficiente.");
  assert.equal(cashPaymentError("10000", 3899.97), "");
});
