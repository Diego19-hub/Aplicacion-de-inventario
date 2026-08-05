export function normalizeSku(value) {
  return String(value ?? "").trim().toUpperCase();
}

export function categorySkuPrefix(categoryName) {
  const normalized = String(categoryName ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

  if (!normalized) return "PRD";
  return normalized.slice(0, 3).padEnd(3, "X");
}
