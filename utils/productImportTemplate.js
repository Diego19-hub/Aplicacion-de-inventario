import XLSX from "xlsx";

const headers = ["nombre_producto", "sku", "codigo_barras", "descripcion", "marca", "precio", "existencias", "categoria", "existencias_minimas", "ubicacion", "proveedor"];

export function productImportTemplateBuffer() {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([headers]);
  for (let row = 1; row <= 1000; row += 1) sheet[`C${row}`] = { t: "s", v: row === 1 ? headers[2] : "", s: { numFmt: "@" } };
  sheet["!cols"] = [{ wch: 22 }, { wch: 16 }, { wch: 18 }, { wch: 24 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 20 }, { wch: 16 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(workbook, sheet, "Productos");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}
