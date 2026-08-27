export function chargeState({ amount, paid, dueDate, status }) {
  if (status === "cancelled") return "cancelled";
  const balance = Math.max(0, Number(amount) - Number(paid));
  if (balance === 0) return "paid";
  if (new Date(`${dueDate}T23:59:59Z`) < new Date()) return "overdue";
  return paid > 0 ? "partially_paid" : "pending";
}

export function accountTotals(charges, payments) {
  const totalCharges = charges.filter((c) => c.status !== "cancelled").reduce((s, c) => s + Number(c.amount), 0);
  const totalPaid = payments.filter((p) => p.status === "active").reduce((s, p) => s + Number(p.amount), 0);
  return { totalCharges, totalPaid, balance: Math.max(0, totalCharges - totalPaid) };
}
