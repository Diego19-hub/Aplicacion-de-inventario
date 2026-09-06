export const valuationLabels = { average: "Promedio", fifo: "PEPS/FIFO" };

export function formatSafeMoney(value, currency = "MXN", missingLabel = "No disponible") {
  if (value === null || value === undefined || (typeof value === "string" && value.trim() === "")) return missingLabel;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return missingLabel;
  return new Intl.NumberFormat("es-MX", { style: "currency", currency }).format(numeric);
}
