export function chargeState({ amount, paid, dueDate, status }) {
  if (status === "cancelled") return "cancelled";
  const balance = Math.max(0, Number(amount) - Number(paid));
  if (balance === 0) return "paid";
  if (new Date(`${dueDate}T23:59:59Z`) < new Date()) return "overdue";
  return paid > 0 ? "partially_paid" : "pending";
}
//Esta función analiza los datos de un cobro individual y devuelve una etiqueta de texto indicando su estado actual. Evalúa la información en un orden lógico muy estricto

export function accountTotals(charges, payments) {
  const totalCharges = charges.filter((c) => c.status !== "cancelled").reduce((s, c) => s + Number(c.amount), 0);
  const totalPaid = payments.filter((p) => p.status === "active").reduce((s, p) => s + Number(p.amount), 0);
  return { totalCharges, totalPaid, balance: Math.max(0, totalCharges - totalPaid) };
}

// Esta función calcula el resumen global del estado de cuenta de un cliente tomando una lista de cobros (charges) y una lista de pagos realizados (payments):