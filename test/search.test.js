import test from "node:test";
import assert from "node:assert/strict";

import { normalizeSearch } from "../utils/search.js";

test("normalizeSearch ignora acentos, espacios y signos", () => {
  assert.equal(normalizeSearch("  Guantes de Boxeo  "), "guantesdeboxeo");
  assert.equal(normalizeSearch("GUANTES-DE-BOXEO"), "guantesdeboxeo");
  assert.equal(normalizeSearch("José"), "jose");
  assert.equal(normalizeSearch(" BOX-001 "), "box001");
});
