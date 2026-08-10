const BOM = "\uFEFF";

export function escapeCsvCell(value) {
  if (value === null || value === undefined) return "";

  const isNumber = typeof value === "number";
  let text = String(value);

  if (!isNumber && /^[ \t]*[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }

  if (/[,"\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

export function createCsv(headers, rows) {
  if (!Array.isArray(headers) || !Array.isArray(rows)) {
    throw new TypeError("headers y rows deben ser arreglos.");
  }

  const lines = [headers.map(escapeCsvCell).join(",")];

  for (const row of rows) {
    if (!Array.isArray(row) || row.length !== headers.length) {
      throw new TypeError("Cada fila debe tener el mismo número de columnas que headers.");
    }
    lines.push(row.map(escapeCsvCell).join(","));
  }

  return BOM + lines.join("\r\n");
}
