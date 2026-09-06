export function parseCurrencyValue(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;

  const normalized = value.replace(/[\s$,]/g, "");
  if (normalized === "") return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

//Esta función sirve para procesar, limpiar y convertir valores de dinero (divisas) ingresados por el usuario o leídos desde un archivo (como el Excel de los códigos anteriores) en números puros de JavaScript con los que se puedan hacer operaciones matemáticas.