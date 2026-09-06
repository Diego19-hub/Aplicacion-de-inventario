import assert from "node:assert/strict";
import test from "node:test";
import ExcelJS from "exceljs";

import { inventoryCenterWorkbookBuffer } from "../utils/inventoryCenterWorkbook.js";
import { productImportTemplateBuffer, readProductWorkbook } from "../utils/productImportWorkbook.js";

const importHeaders = [
  "nombre_producto", "sku", "codigo_barras", "descripcion", "marca",
  "precio", "existencias", "categoria", "existencias_minimas", "ubicacion", "proveedor"
];

async function loadWorkbook(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  return workbook;
}

test("la plantilla de importación XLSX se genera y vuelve a abrir con sus encabezados", async () => {
  const buffer = Buffer.from(await productImportTemplateBuffer(importHeaders));
  const workbook = await loadWorkbook(buffer);

  assert.equal(buffer.subarray(0, 2).toString(), "PK");
  assert.deepEqual(workbook.worksheets.map((sheet) => sheet.name), ["Productos"]);
  assert.deepEqual(
    workbook.getWorksheet("Productos").getRow(1).values.slice(1),
    importHeaders
  );
  const parsedRows = await readProductWorkbook(buffer);
  assert.deepEqual(parsedRows[0], importHeaders);
  assert.equal(parsedRows.length, 1000);
  assert.ok(parsedRows.slice(1).every((row) => row.every((value) => value === "")));
});

test("la exportación de inventario XLSX conserva hoja, encabezados y datos", async () => {
  const buffer = Buffer.from(await inventoryCenterWorkbookBuffer([{
    name: "Producto Excel",
    sku: "EXCEL-001",
    category_name: "General",
    location_name: "Principal",
    stock: "3",
    cost_price: "12.50",
    total_value: "37.50",
    stock_status: "ok"
  }]));
  const workbook = await loadWorkbook(buffer);
  const sheet = workbook.getWorksheet("Inventario actual");

  assert.equal(buffer.subarray(0, 2).toString(), "PK");
  assert.deepEqual(workbook.worksheets.map((currentSheet) => currentSheet.name), ["Inventario actual"]);
  assert.deepEqual(sheet.getRow(1).values.slice(1), ["Producto", "SKU", "Categoría", "Ubicación", "Existencias", "Costo unitario", "Valor total", "Estado"]);
  assert.deepEqual(sheet.getRow(2).values.slice(1), ["Producto Excel", "EXCEL-001", "General", "Principal", 3, 12.5, 37.5, "ok"]);
  assert.equal(sheet.getColumn(6).numFmt, '"$"#,##0.00');
  assert.equal(sheet.getColumn(7).numFmt, '"$"#,##0.00');
});
