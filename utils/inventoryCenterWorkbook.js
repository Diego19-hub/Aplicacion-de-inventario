import ExcelJS from "exceljs";

const columns = [
  { header: "Producto", key: "product" },
  { header: "SKU", key: "sku" },
  { header: "Categoría", key: "category" },
  { header: "Ubicación", key: "location" },
  { header: "Existencias", key: "stock" },
  { header: "Costo unitario", key: "unitCost" },
  { header: "Valor total", key: "totalValue" },
  { header: "Estado", key: "status" }
];

export async function inventoryCenterWorkbookBuffer(inventory) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Inventario actual");

  sheet.columns = columns;
  inventory.forEach((row) => sheet.addRow({
    product: row.name,
    sku: row.sku,
    category: row.category_name,
    location: row.location_name,
    stock: Number(row.stock),
    unitCost: Number(row.cost_price),
    totalValue: Number(row.total_value),
    status: row.stock_status
  }));
  sheet.getColumn("unitCost").numFmt = '"$"#,##0.00';
  sheet.getColumn("totalValue").numFmt = '"$"#,##0.00';

  return workbook.xlsx.writeBuffer();
}
