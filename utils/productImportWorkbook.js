import ExcelJS from "exceljs";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_UNCOMPRESSED_BYTES = 20 * 1024 * 1024;
const MAX_SHEETS = 10;
const MAX_ROWS = 10_000;
const MAX_COLUMNS = 50;
const MAX_CELLS = 500_000;
const LOAD_TIMEOUT_MS = 5_000;

function importError(message, code = "INVALID_XLSX") {
  return Object.assign(new Error(message), { code });
}

function inspectZip(buffer) {
  if (buffer.length < 4 || buffer.readUInt32LE(0) !== 0x04034b50) throw importError("El archivo no es un XLSX válido.");
  let offset = buffer.length - 22;
  while (offset >= 0 && buffer.readUInt32LE(offset) !== 0x06054b50) offset -= 1;
  if (offset < 0) throw importError("El archivo XLSX está corrupto.");
  const entries = buffer.readUInt16LE(offset + 10);
  const directoryOffset = buffer.readUInt32LE(offset + 16);
  const names = [];
  let cursor = directoryOffset;
  let total = 0;
  for (let index = 0; index < entries; index += 1) {
    if (cursor + 46 > buffer.length || buffer.readUInt32LE(cursor) !== 0x02014b50) throw importError("El archivo XLSX está corrupto.");
    const compressed = buffer.readUInt32LE(cursor + 20);
    const uncompressed = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const name = buffer.toString("utf8", cursor + 46, cursor + 46 + nameLength);
    names.push(name);
    total += uncompressed;
    if (total > MAX_UNCOMPRESSED_BYTES || compressed > MAX_FILE_BYTES || uncompressed > MAX_UNCOMPRESSED_BYTES) throw importError("El archivo XLSX excede el tamaño descomprimido permitido.", "XLSX_TOO_LARGE");
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  if (names.some((name) => /(^|\/)vbaProject\.bin$/i.test(name))) throw importError("Los archivos XLSX con macros no están permitidos.");
  if (names.some((name) => /^xl\/externalLinks\//i.test(name))) throw importError("Los enlaces externos no están permitidos.");
  return names;
}

function withTimeout(promise) {
  return Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(importError("El procesamiento del XLSX excedió el tiempo permitido.", "XLSX_TIMEOUT")), LOAD_TIMEOUT_MS))]);
}

export async function readProductWorkbook(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length > MAX_FILE_BYTES) throw importError("El archivo no puede superar 5 MB.", "XLSX_TOO_LARGE");
  const names = inspectZip(buffer);
  const workbook = new ExcelJS.Workbook();
  await withTimeout(workbook.xlsx.load(buffer, { ignoreNodes: [] }));
  if (workbook.worksheets.length === 0) throw importError("El archivo no contiene hojas.", "EMPTY_WORKBOOK");
  if (workbook.worksheets.length > MAX_SHEETS) throw importError("El archivo contiene demasiadas hojas.", "XLSX_TOO_MANY_SHEETS");
  const sheet = workbook.worksheets[0];
  if (sheet.rowCount > MAX_ROWS || sheet.columnCount > MAX_COLUMNS || sheet.actualRowCount * sheet.actualColumnCount > MAX_CELLS) throw importError("El archivo XLSX excede los límites de filas, columnas o celdas.", "XLSX_TOO_LARGE");
  for (const currentSheet of workbook.worksheets) currentSheet.eachRow((row) => row.eachCell((cell) => {
    if (cell.value && typeof cell.value === "object" && ("formula" in cell.value || "sharedFormula" in cell.value)) throw importError("Las fórmulas no están permitidas.");
  }));
  const rows = [];
  sheet.eachRow({ includeEmpty: true }, (row) => rows.push(Array.from({ length: Math.max(sheet.columnCount, 1) }, (_, index) => row.getCell(index + 1).value?.result ?? row.getCell(index + 1).value ?? "")));
  return rows;
}

export async function productImportTemplateBuffer(headers) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Productos");
  sheet.addRow(headers);
  for (let row = 2; row <= 1000; row += 1) sheet.getCell(row, 3).numFmt = "@";
  sheet.columns = [22, 16, 18, 24, 16, 14, 14, 16, 20, 16, 16].map((width) => ({ width }));
  return workbook.xlsx.writeBuffer();
}
