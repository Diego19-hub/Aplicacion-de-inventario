import { useState } from "react";
import { apiRequest } from "../api/client.js";
import { BarcodeScanner } from "./BarcodeScanner.jsx";

export function Select({ id, label, error, hint, children, ...props }) {
  const [scanResult, setScanResult] = useState(null);
  const productScanner = /^(transaction-product|purchase-item|return-product)-?\d*$/.test(id);
  const handleDetected = async (code) => {
    try {
      const result = await apiRequest(`/products?q=${encodeURIComponent(code)}`);
      const product = result?.products?.find((item) => String(item.barcode || "") === String(code));
      if (!product) throw new Error("No existe un producto con ese código de barras.");
      setScanResult(product);
      props.onChange?.({ target: { value: String(product.id) } });
      const quantityInput = document.getElementById(id.replace("product", "quantity"));
      if (quantityInput && !quantityInput.value) {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
        setter?.call(quantityInput, "1");
        quantityInput.dispatchEvent(new Event("input", { bubbles: true }));
      }
    } catch (scanError) {
      setScanResult({ error: scanError.message || "No existe un producto con ese código de barras." });
    }
  };
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;

  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>{label}</label>
      <select id={id} className="field__control" aria-invalid={Boolean(error)} aria-describedby={describedBy} {...props}>{children}</select>
      {productScanner && <><BarcodeScanner idPrefix={`${id}-barcode`} label="Escanear producto" onDetected={handleDetected} /><span className="field__hint">Selecciona automáticamente el producto y muestra su nombre, SKU y stock.</span>{scanResult && (scanResult.error ? <span className="field__error">{scanResult.error}</span> : <span className="field__hint">{scanResult.name} · {scanResult.sku} · Stock {scanResult.stock ?? "—"}</span>)}</>}
      {hint && <span id={`${id}-hint`} className="field__hint">{hint}</span>}
      {error && <span id={`${id}-error`} className="field__error">{error}</span>}
    </div>
  );
}
