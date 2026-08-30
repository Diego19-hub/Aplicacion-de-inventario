import { CheckCircle2, Minus, Plus, Search, ShoppingCart, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { apiRequest } from "../api/client.js";
import { Alert } from "../components/Alert.jsx";
import { Button } from "../components/Button.jsx";
import { Card } from "../components/Card.jsx";
import { EmptyState } from "../components/EmptyState.jsx";
import { Input } from "../components/Input.jsx";
import { InfoTip } from "../components/InfoTip.jsx";
import { PageHeader } from "../components/PageHeader.jsx";
import { Select } from "../components/Select.jsx";
import { Spinner } from "../components/Spinner.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { BarcodeScanner } from "../components/BarcodeScanner.jsx";
import { HelpInfoPanel } from "../components/HelpInfoPanel.jsx";
import { Link } from "react-router-dom";

function formatMoney(value, currency = "MXN") {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency }).format(Number(value) || 0);
}

function errorMessage(error) {
  const messages = {
    AUTH_REQUIRED: "Tu sesión terminó. Inicia sesión nuevamente.",
    FORBIDDEN: "No tienes permisos para registrar ventas.",
    POS_INSUFFICIENT_STOCK: "No hay existencias suficientes para completar la venta.",
    POS_PRODUCT_NOT_FOUND: "Uno de los productos ya no está disponible.",
    POS_PRODUCT_INACTIVE: "Uno de los productos está archivado y no se puede vender.",
    POS_INVALID_PAYMENT: "Selecciona un método de pago válido.",
    POS_CASH_REQUIRED: "Indica el efectivo recibido para una venta en efectivo.",
    POS_CASH_INSUFFICIENT: "El efectivo recibido no cubre el total de la venta.",
    CASH_SESSION_REQUIRED: "No hay una caja abierta para esta ubicación.",
    POS_LOCATION_REQUIRED: "Selecciona una ubicación activa para continuar."
  };
  return messages[error?.code] || error?.message || "No fue posible completar la operación.";
}

export function PointOfSalePage() {
  const { session } = useAuth();
  const currency = session.activeBusiness?.currency || "MXN";
  const [options, setOptions] = useState(null);
  const [locationId, setLocationId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [amountReceived, setAmountReceived] = useState("");
  const [query, setQuery] = useState("");
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [completedSale, setCompletedSale] = useState(null);
  const [isLoadingOptions, setIsLoadingOptions] = useState(true);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [errorCode, setErrorCode] = useState("");

  const loadOptions = useCallback(async (signal) => {
    setIsLoadingOptions(true);
    setError("");
    try {
      const data = await apiRequest("/pos/form-options", { signal });
      setOptions(data);
      setLocationId((current) => current || String(data.defaultLocationId ?? data.locations[0]?.id ?? ""));
      setPaymentMethod((current) => current || data.paymentMethods?.[0] || "cash");
    } catch (requestError) {
      if (requestError?.name === "AbortError" || requestError?.message?.toLowerCase().includes("aborted")) return;
      setError(errorMessage(requestError));
    } finally {
      if (!signal?.aborted) setIsLoadingOptions(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    loadOptions(controller.signal);
    return () => controller.abort();
  }, [loadOptions]);

  const loadProducts = useCallback(async (signal) => {
    if (!locationId) {
      setProducts([]);
      return;
    }
    setIsLoadingProducts(true);
    try {
      const params = new URLSearchParams({ locationId });
      if (query.trim()) params.set("q", query.trim());
      const data = await apiRequest(`/pos/products?${params.toString()}`, { signal });
      setProducts(data.products ?? []);
    } catch (requestError) {
      if (requestError?.name === "AbortError" || requestError?.message?.toLowerCase().includes("aborted")) return;
      setError(errorMessage(requestError));
    } finally {
      if (!signal?.aborted) setIsLoadingProducts(false);
    }
  }, [locationId, query]);

  useEffect(() => {
    if (!options || !locationId) return undefined;
    const controller = new AbortController();
    const timer = window.setTimeout(() => loadProducts(controller.signal), 300);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [loadProducts, locationId, options]);

  const total = useMemo(
    () => Number(cart.reduce((sum, item) => sum + item.quantity * Number(item.price), 0).toFixed(2)),
    [cart]
  );
  const received = Number(amountReceived);
  const change = paymentMethod === "cash" && Number.isFinite(received) ? Math.max(0, received - total) : 0;

  function addProduct(product) {
    setError("");
    if (Number(product.stock) < 1) {
      setError("Este producto no tiene existencias en la ubicación seleccionada.");
      return;
    }
    setCart((current) => {
      const existing = current.find((item) => item.id === product.id);
      if (existing) {
        if (existing.quantity >= Number(product.stock)) {
          setError("No puedes agregar una cantidad mayor al stock disponible.");
          return current;
        }
        return current.map((item) => item.id === product.id ? { ...item, quantity: item.quantity + 1, stock: Number(product.stock) } : item);
      }
      return [...current, { ...product, stock: Number(product.stock), quantity: 1 }];
    });
  }

  function updateQuantity(productId, nextQuantity) {
    setCart((current) => current.map((item) => {
      if (item.id !== productId) return item;
      return { ...item, quantity: Math.min(Math.max(1, nextQuantity), item.stock) };
    }));
  }

  function removeProduct(productId) {
    setCart((current) => current.filter((item) => item.id !== productId));
  }

  function changeLocation(event) {
    setLocationId(event.target.value);
    setCart([]);
    setCompletedSale(null);
    setError("");
    setErrorCode("");
  }

  function changePaymentMethod(event) {
    setPaymentMethod(event.target.value);
    setAmountReceived("");
    setError("");
    setErrorCode("");
  }

  async function submitSale(event) {
    event.preventDefault();
    if (isSubmitting) return;
    setErrorCode("");
    if (!locationId) return setError("Selecciona una ubicación activa.");
    if (cart.length === 0) return setError("Agrega al menos un producto al carrito.");
    if (cart.some((item) => item.quantity < 1 || item.quantity > item.stock)) return setError("Revisa las cantidades del carrito.");
    if (paymentMethod === "cash" && (!amountReceived || !Number.isFinite(received) || received < total)) return setError("El efectivo recibido debe cubrir el total de la venta.");

    setIsSubmitting(true);
    setError("");
    try {
      const data = await apiRequest("/sales", {
        method: "POST",
        csrf: true,
        body: {
          locationId: Number(locationId),
          paymentMethod,
          ...(paymentMethod === "cash" ? { amountReceived: received } : {}),
          items: cart.map((item) => ({ itemId: item.id, quantity: item.quantity }))
        }
      });
      setCompletedSale(data.sale);
      setCart([]);
      setAmountReceived("");
      await loadProducts();
    } catch (requestError) {
      setError(errorMessage(requestError));
      setErrorCode(requestError?.code || "");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!session.permissions.canManageInventory) {
    return <EmptyState title="Acceso restringido" description="Solo owner y manager pueden registrar ventas en el punto de venta." />;
  }
  if (isLoadingOptions) return <section className="dashboard-state"><Spinner label="Cargando punto de venta" /></section>;
  if (!options) return <Alert><div className="dashboard-error"><span>{error || "No fue posible cargar el punto de venta."}</span><Button variant="secondary" onClick={() => loadOptions()}>Reintentar</Button></div></Alert>;

  return (
    <section className="pos-page"><HelpInfoPanel moduleKey="inventory" />
      <PageHeader title="Punto de venta" description="Registra ventas y descuenta existencias de la ubicación seleccionada." />
      {error && <Alert><div className="dashboard-error"><span>{error}{errorCode === "CASH_SESSION_REQUIRED" && <InfoTip title="Sesión de caja requerida" content="Las ventas en efectivo necesitan una caja abierta en la misma ubicación." />}</span>{errorCode === "CASH_SESSION_REQUIRED" && <Link className="button button--secondary" to="/app/cash">Abrir caja</Link>}</div></Alert>}
      {completedSale ? (
        <Card className="pos-complete">
          <CheckCircle2 aria-hidden="true" />
          <p className="eyebrow">Venta completada</p>
          <h2>Venta #{completedSale.id}</h2>
          <p>Se registró por <strong>{formatMoney(completedSale.total, currency)}</strong> mediante {completedSale.paymentMethod === "cash" ? "efectivo" : completedSale.paymentMethod === "card" ? "tarjeta" : "transferencia"}.</p>
          <Button onClick={() => setCompletedSale(null)}><ShoppingCart aria-hidden="true" />Nueva venta</Button>
        </Card>
      ) : (
        <div className="pos-layout">
          <div className="pos-catalog">
            <Card className="pos-toolbar">
              <Select id="pos-location" label="Ubicación" value={locationId} onChange={changeLocation} required>
                <option value="">Selecciona una ubicación</option>
                {options.locations.map((location) => <option key={location.id} value={location.id}>{location.name} ({location.code}){location.isDefault ? " · Predeterminada" : ""}</option>)}
              </Select>
              <form className="pos-search" onSubmit={(event) => event.preventDefault()}>
                <Input id="pos-search" label="Buscar producto" type="search" placeholder="Nombre, SKU o código de barras" value={query} onChange={(event) => setQuery(event.target.value)} />
                <Button type="submit" aria-label="Buscar productos"><Search aria-hidden="true" />Buscar</Button>
              </form>
              <BarcodeScanner label="Escanear producto" onDetected={(code) => setQuery(code)} />
            </Card>
            <Card>
              <div className="pos-section-heading"><div><p className="eyebrow">Catálogo activo</p><h2>Productos <InfoTip title="Existencia disponible" content="Es la cantidad que puedes vender en la ubicación seleccionada." /></h2></div>{isLoadingProducts && <Spinner label="Buscando" />}</div>
              {!isLoadingProducts && products.length === 0 && <p className="pos-empty">{query ? "No se encontraron productos." : "No hay productos activos disponibles."}</p>}
              <div className="pos-products" aria-live="polite">
                {products.map((product) => <article className="pos-product" key={product.id}>
                  <div><strong>{product.name}</strong><span>{product.sku}{product.barcode ? ` · ${product.barcode}` : ""}</span></div>
                  <div className="pos-product__meta"><strong>{formatMoney(product.price, currency)}</strong><span className={product.stock < 1 ? "pos-stock pos-stock--empty" : "pos-stock"}>{product.stock} disponibles</span><Button variant="secondary" onClick={() => addProduct(product)} disabled={product.stock < 1}><Plus aria-hidden="true" />Agregar</Button></div>
                </article>)}
              </div>
            </Card>
          </div>
          <Card className="pos-cart-card">
            <div className="pos-section-heading"><div><p className="eyebrow">Venta actual</p><h2>Carrito <InfoTip title="Carrito" content="Aquí se reúnen los productos, cantidades y totales de esta venta." /></h2></div><ShoppingCart aria-hidden="true" /></div>
            {cart.length === 0 ? <div className="pos-cart-empty"><ShoppingCart aria-hidden="true" /><p>El carrito está vacío.</p><span>Agrega productos del catálogo para comenzar.</span></div> : <div className="pos-cart-items">{cart.map((item) => <article className="pos-cart-item" key={item.id}>
              <div className="pos-cart-item__heading"><strong>{item.name}</strong><span>{item.sku}</span></div>
              <div className="pos-cart-item__controls"><div className="pos-quantity"><Button variant="secondary" aria-label={`Disminuir cantidad de ${item.name}`} onClick={() => updateQuantity(item.id, item.quantity - 1)} disabled={item.quantity <= 1}><Minus aria-hidden="true" /></Button><strong>{item.quantity}</strong><Button variant="secondary" aria-label={`Aumentar cantidad de ${item.name}`} onClick={() => updateQuantity(item.id, item.quantity + 1)} disabled={item.quantity >= item.stock}><Plus aria-hidden="true" /></Button></div><span>{formatMoney(item.quantity * Number(item.price), currency)}</span><Button variant="ghost" aria-label={`Eliminar ${item.name}`} onClick={() => removeProduct(item.id)}><Trash2 aria-hidden="true" /></Button></div>
            </article>)}</div>}
            <form className="pos-summary" onSubmit={submitSale}>
              <div className="pos-total-row"><span>Subtotal</span><strong>{formatMoney(total, currency)}</strong></div>
              <div className="pos-total-row pos-total-row--total"><span>Total</span><strong>{formatMoney(total, currency)}</strong></div>
              <Select id="pos-payment" label={<span>Método de pago <InfoTip title="Métodos de pago" content="Elige efectivo, tarjeta o transferencia según cómo recibas el pago." /></span>} value={paymentMethod} onChange={changePaymentMethod}>
                {options.paymentMethods.map((method) => <option key={method} value={method}>{method === "cash" ? "Efectivo" : method === "card" ? "Tarjeta" : "Transferencia"}</option>)}
              </Select>
              {paymentMethod === "cash" && <><Input id="pos-received" label={<span>Cantidad recibida <InfoTip title="Efectivo recibido" content="Escribe cuánto dinero entregó el cliente. Debe cubrir el total de la venta." /></span>} type="number" min={total} step="0.01" inputMode="decimal" value={amountReceived} onChange={(event) => setAmountReceived(event.target.value)} /><div className="pos-change"><span>Cambio <InfoTip title="Cambio" content="Es la diferencia entre el efectivo recibido y el total de la venta." /></span><strong>{formatMoney(change, currency)}</strong></div></>}
              <Button type="submit" disabled={isSubmitting || cart.length === 0 || !locationId}>{isSubmitting ? <Spinner label="Procesando venta" /> : "Finalizar venta"}</Button>
            </form>
          </Card>
        </div>
      )}
    </section>
  );
}
