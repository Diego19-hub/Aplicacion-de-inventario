import test from "node:test";
import assert from "node:assert/strict";

import { parseCurrencyValue } from "../utils/currency.js";

test("parseCurrencyValue normaliza precios válidos", () => {
  assert.equal(parseCurrencyValue(1299.9), 1299.9);
  assert.equal(parseCurrencyValue("$1,299.90"), 1299.9);
  assert.equal(parseCurrencyValue("1,299.90"), 1299.9);
});

test("parseCurrencyValue rechaza precios inválidos", () => {
  assert.equal(parseCurrencyValue(""), null);
  assert.equal(parseCurrencyValue("   "), null);
  assert.equal(parseCurrencyValue(-1), -1);
  assert.equal(parseCurrencyValue("precio desconocido"), null);
  assert.equal(parseCurrencyValue(Number.NaN), null);
  assert.equal(parseCurrencyValue(Number.POSITIVE_INFINITY), null);
});
