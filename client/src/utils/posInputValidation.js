export function validateSaleQuantity(value, stock) {
  const raw = String(value ?? "").trim();
  const available = Number(stock);

  if (!/^\d+$/.test(raw) || Number(raw) < 1) {
    return { quantity: null, error: "La cantidad a vender debe ser al menos 1." };
  }

  const quantity = Number(raw);
  if (quantity > available) {
    return { quantity: available, error: `Solo hay ${available} unidades disponibles para vender.` };
  }

  return { quantity, error: "" };
}

export function cashPaymentError(amountReceived, total) {
  const received = Number(amountReceived);
  return Number.isFinite(received) && received >= total ? "" : "El efectivo recibido es insuficiente.";
}
