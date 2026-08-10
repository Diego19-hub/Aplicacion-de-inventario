import test from "node:test";
import assert from "node:assert/strict";
import { createCsv, escapeCsvCell } from "../utils/csv.js";

test("createCsv incluye BOM, encabezados y valores normales", () => {
  assert.equal(createCsv(["Nombre", "Valor"], [["Guantes", 12]]), "\uFEFFNombre,Valor\r\nGuantes,12");
});

test("escapeCsvCell maneja comas, comillas y saltos", () => {
  assert.equal(escapeCsvCell("a,b"), '"a,b"');
  assert.equal(escapeCsvCell('a"b'), '"a""b"');
  assert.equal(escapeCsvCell("a\nb"), '"a\nb"');
});

test("null y undefined quedan vacíos y números negativos no se protegen", () => {
  assert.equal(createCsv(["A", "B", "C"], [[null, undefined, -5]]), "\uFEFFA,B,C\r\n,,-5");
});

test("protege fórmulas de texto", () => {
  for (const value of ["=1+1", "+1", "-1", "@x", "  =x"]) {
    assert.equal(escapeCsvCell(value), `'${value}`);
  }
});

test("rechaza filas con columnas distintas", () => {
  assert.throws(() => createCsv(["A", "B"], [["solo una"]]), TypeError);
});
