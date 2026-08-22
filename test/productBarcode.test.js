import test from "node:test";
import assert from "node:assert/strict";

import { parseBarcode } from "../controllers/apiProductImportController.js";

test("parseBarcode conserva ceros, elimina separadores y valida el rango", () => {
  assert.deepEqual(parseBarcode("0123456789012", 2), { value: "0123456789012", error: null });
  assert.deepEqual(parseBarcode("7501-2345 6789", 2), { value: "750123456789", error: null });
  assert.deepEqual(parseBarcode("", 2), { value: null, error: null });
  assert.equal(parseBarcode("ABC12345", 2).error.message, "El código de barras debe contener entre 8 y 14 dígitos.");
  assert.ok(parseBarcode("1234567", 2).error);
  assert.ok(parseBarcode("123456789012345", 2).error);
});
