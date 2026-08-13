import { ArrowLeft, ArrowRightLeft } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { apiRequest } from "../api/client.js";
import { Alert } from "../components/Alert.jsx";
import { Button } from "../components/Button.jsx";
import { Card } from "../components/Card.jsx";
import { EmptyState } from "../components/EmptyState.jsx";
import { Input } from "../components/Input.jsx";
import { PageHeader } from "../components/PageHeader.jsx";
import { Select } from "../components/Select.jsx";
import { Spinner } from "../components/Spinner.jsx";
import { useAuth } from "../context/AuthContext.jsx";

const initialForm = {
  productId: "",
  fromLocationId: "",
  toLocationId: "",
  quantity: "",
  reason: "",
  reference: ""
};

function errorsByField(fields = []) {
  return Object.fromEntries(fields.map((field) => [field.field, field.message]));
}

function initialLocations(locations) {
  return {
    fromLocationId: String(locations[0]?.id ?? ""),
    toLocationId: String(locations[1]?.id ?? "")
  };
}

export function NewTransferPage() {
  const { session } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState({});
  const [requestError, setRequestError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadOptions = useCallback(async () => {
    if (!session.permissions.canManageInventory) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setRequestError("");
    try {
      const product = searchParams.get("product");
      const response = await apiRequest(`/transfers/form-options${product ? `?product=${encodeURIComponent(product)}` : ""}`);
      setData(response);
      setForm((current) => ({
        ...current,
        productId: current.productId || String(response.selectedProductId ?? ""),
        ...initialLocations(response.locations)
      }));
    } catch (error) {
      setRequestError(error.message || "No fue posible cargar las opciones de transferencia.");
    } finally {
      setIsLoading(false);
    }
  }, [searchParams, session.permissions.canManageInventory]);

  useEffect(() => {
    loadOptions();
  }, [loadOptions]);

  const selectedProduct = useMemo(
    () => data?.products.find((product) => product.id === Number(form.productId)) ?? null,
    [data, form.productId]
  );
  const selectedOrigin = useMemo(
    () => data?.locations.find((location) => location.id === Number(form.fromLocationId)) ?? null,
    [data, form.fromLocationId]
  );
  const selectedDestination = useMemo(
    () => data?.locations.find((location) => location.id === Number(form.toLocationId)) ?? null,
    [data, form.toLocationId]
  );
  const originStock = useMemo(() => {
    const balance = data?.balances.find((candidate) => (
      candidate.productId === Number(form.productId)
      && candidate.locationId === Number(form.fromLocationId)
    ));
    return balance?.stock ?? 0;
  }, [data, form.productId, form.fromLocationId]);

  function update(field, value) {
    setForm((current) => {
      const next = { ...current, [field]: value };
      if (field === "fromLocationId" && value === next.toLocationId) {
        next.toLocationId = String(data.locations.find((location) => String(location.id) !== value)?.id ?? "");
      }
      if (field === "toLocationId" && value === next.fromLocationId) {
        next.fromLocationId = String(data.locations.find((location) => String(location.id) !== value)?.id ?? "");
      }
      return next;
    });
    setErrors((current) => {
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  async function submit(event) {
    event.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);
    setErrors({});
    setRequestError("");
    try {
      await apiRequest("/transfers", { method: "POST", body: form, csrf: true });
      navigate(`/app/products/${form.productId}/movements`);
    } catch (error) {
      setErrors(errorsByField(error.fields));
      setRequestError(error.message || "No fue posible registrar la transferencia.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!session.permissions.canManageInventory) {
    return <EmptyState title="Acceso restringido" description="No tienes permiso para registrar transferencias en este negocio." action={<Link className="button button--secondary" to="/app/products">Volver a productos</Link>} />;
  }
  if (isLoading) return <section className="dashboard-state"><Spinner label="Cargando opciones de transferencia" /></section>;
  if (requestError && !data) return <Alert><div className="dashboard-error"><span>{requestError}</span><Button variant="secondary" onClick={loadOptions}>Reintentar</Button></div></Alert>;

  const hasEnoughLocations = data.locations.length >= 2;
  const cancelTarget = selectedProduct ? `/app/products/${selectedProduct.id}` : "/app/products";

  return <>
    <Link to={cancelTarget} className="back-link"><ArrowLeft aria-hidden="true" />Volver a productos</Link>
    <PageHeader title="Transferir existencias" description="Mueve unidades entre ubicaciones sin cambiar el stock total." />
    {!hasEnoughLocations ? <EmptyState title="Se necesitan dos ubicaciones activas" description="Crea o reactiva una segunda ubicación antes de registrar una transferencia." action={<Link className="button button--secondary" to={cancelTarget}>Volver</Link>} /> : <Card>
      <form className="product-form" onSubmit={submit} noValidate>
        {requestError && <Alert><span>{requestError}</span></Alert>}
        {Object.keys(errors).length > 0 && <Alert><div><strong>Revisa los campos marcados.</strong><ul>{Object.entries(errors).map(([field, message]) => <li key={field}>{message}</li>)}</ul></div></Alert>}
        <div className="product-form__fields">
          <Select id="transfer-product" label="Producto *" value={form.productId} onChange={(event) => update("productId", event.target.value)} error={errors.productId} required>
            <option value="">Selecciona un producto</option>
            {data.products.map((product) => <option key={product.id} value={product.id}>{product.name} ({product.sku})</option>)}
          </Select>
          <div className="transfer-location-grid">
            <Select id="transfer-origin" label="Ubicación de origen *" value={form.fromLocationId} onChange={(event) => update("fromLocationId", event.target.value)} error={errors.fromLocationId} required>
              {data.locations.map((location) => <option key={location.id} value={location.id}>{location.name} ({location.code}){location.isDefault ? " · Principal" : ""}</option>)}
            </Select>
            <Select id="transfer-destination" label="Ubicación de destino *" value={form.toLocationId} onChange={(event) => update("toLocationId", event.target.value)} error={errors.toLocationId} required>
              {data.locations.map((location) => <option key={location.id} value={location.id}>{location.name} ({location.code}){location.isDefault ? " · Principal" : ""}</option>)}
            </Select>
          </div>
          {selectedProduct && selectedOrigin && <p className="local-stock" aria-live="polite">Stock local disponible en {selectedOrigin.name}: <strong>{originStock} unidades</strong></p>}
          <Input id="transfer-quantity" label="Cantidad a transferir *" type="number" value={form.quantity} onChange={(event) => update("quantity", event.target.value)} min="1" max="1000000" step="1" inputMode="numeric" hint="El origen debe tener existencias locales suficientes." error={errors.quantity} required />
          <label className="field" htmlFor="transfer-reason"><span className="field__label">Motivo *</span><textarea id="transfer-reason" className="field__control" value={form.reason} onChange={(event) => update("reason", event.target.value)} minLength="5" maxLength="500" required aria-invalid={Boolean(errors.reason)} aria-describedby={errors.reason ? "transfer-reason-error" : undefined} />{errors.reason && <span id="transfer-reason-error" className="field__error">{errors.reason}</span>}</label>
          <Input id="transfer-reference" label="Referencia (opcional)" value={form.reference} onChange={(event) => update("reference", event.target.value)} maxLength="120" error={errors.reference} />
        </div>
        {selectedProduct && selectedOrigin && selectedDestination && <section className="transfer-summary" aria-label="Resumen de transferencia"><ArrowRightLeft aria-hidden="true" /><div><strong>{selectedProduct.name}</strong><span>{selectedOrigin.name} → {selectedDestination.name}</span></div><strong>{form.quantity || 0} unidades</strong></section>}
        <div className="product-form__actions"><Link className="button button--secondary" to={cancelTarget}>Cancelar</Link><Button type="submit" disabled={isSubmitting || !form.productId || !form.fromLocationId || !form.toLocationId}>{isSubmitting ? "Registrando transferencia…" : "Confirmar transferencia"}</Button></div>
      </form>
    </Card>}
  </>;
}
