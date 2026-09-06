export function normalizeSku(value) {
  return String(value ?? "").trim().toUpperCase();
}
//Su objetivo es limpiar el código SKU de un producto para que siempre tenga el mismo formato estricto.

export function categorySkuPrefix(categoryName) {
  const normalized = String(categoryName ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

  if (!normalized) return "PRD";
  return normalized.slice(0, 3).padEnd(3, "X");
}
// Su objetivo es generar un prefijo de 3 letras basado en el nombre de una categoría para usarlo al inicio de un SKU.