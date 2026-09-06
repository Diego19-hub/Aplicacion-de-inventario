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

//Este código es un sistema para generar archivos CSV de forma ultra segura en Node.js o el navegador. Su propósito principal es tomar una lista de encabezados y filas de datos, y convertirlos en un texto con formato CSV listo para descargarse, aplicando dos protecciones de seguridad críticas (contra inyección de fórmulas y problemas de lectura en Excel).