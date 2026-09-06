import { ArrowLeft } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

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
  locationId: "", movementType: "entry", quantity: "", reason: "", reference: "", unitCost: "", zeroCostReason: ""
};

const movementHelp = {
  entry: { label: "Unidades que ingresan *", hint: "Indica cuántas unidades ingresan a la ubicación." },
  exit: { label: "Unidades que salen *", hint: "Indica cuántas unidades salen de la ubicación." },
  adjustment: { label: "Saldo local final *", hint: "Indica el saldo final deseado para esta ubicación; el sistema registrará la diferencia." }
};

function errorsByField(fields = []) { return Object.fromEntries(fields.map((field) => [field.field, field.message])); }
function isZeroCost(value) { return /^0(?:\.0+)?$/.test(String(value ?? "").trim()); }
function hasNonNegativeDecimal(value) { return /^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(String(value ?? "").trim()); }

export function NewProductMovementPage() {
  const { productId } = useParams();
  const { session } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [valuationMethod, setValuationMethod] = useState(null);
  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState({});
  const [requestError, setRequestError] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(async () => {
    if (!session.permissions.canManageInventory) { setLoading(false); return; }
    setLoading(true); setRequestError(""); setNotFound(false);
    try {
      const [response, valuation] = await Promise.all([
        apiRequest(`/products/${productId}/movements/form-options`),
        apiRequest("/business/settings/valuation")
      ]);
      setData(response);
      setValuationMethod(valuation?.valuationMethod ?? null);
      setForm((current) => ({ ...current, locationId: current.locationId || String(response.locations[0]?.id ?? "") }));
    } catch (error) {
      if (error.code === "PRODUCT_NOT_FOUND") setNotFound(true);
      else setRequestError(error.message || "No fue posible cargar las opciones del movimiento.");
    } finally { setLoading(false); }
  }, [productId, session.permissions.canManageInventory]);

  useEffect(() => { load(); }, [load]);

  const selectedLocation = useMemo(() => data?.locations.find((location) => location.id === Number(form.locationId)) ?? null, [data, form.locationId]);
  const isFifo = valuationMethod === "fifo";
  const showsCostField = form.movementType === "adjustment" || (isFifo && form.movementType === "entry");
  const requiresFifoCost = isFifo && form.movementType === "entry";
  const showsZeroCostReason = showsCostField && isZeroCost(form.unitCost);
  const requiresZeroCostReason = isFifo && showsZeroCostReason;

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => { const next = { ...current }; delete next[field]; return next; });
  }

  function updateUnitCost(value) {
    setForm((current) => ({ ...current, unitCost: value, zeroCostReason: isZeroCost(value) ? current.zeroCostReason : "" }));
    setErrors((current) => { const next = { ...current }; delete next.unitCost; delete next.zeroCostReason; return next; });
  }

  function focusField(field) { window.requestAnimationFrame(() => document.getElementById(field)?.focus()); }

  function validateFifoCost() {
    if (!isFifo || !showsCostField) return {};
    if (String(form.unitCost).trim() === "") return requiresFifoCost ? { unitCost: "Indica el costo unitario para crear la capa FIFO." } : {};
    if (!hasNonNegativeDecimal(form.unitCost)) return { unitCost: "El costo unitario debe ser cero o mayor." };
    if (isZeroCost(form.unitCost) && form.zeroCostReason !== "no_cost_known") return { zeroCostReason: "Selecciona Costo no conocido para registrar costo cero." };
    return {};
  }

  async function submit(event) {
    event.preventDefault();
    if (submitting) return;
    const localErrors = validateFifoCost();
    if (Object.keys(localErrors).length > 0) {
      setErrors(localErrors);
      setRequestError("Completa el costo FIFO antes de registrar el movimiento.");
      focusField(localErrors.unitCost ? "movement-unit-cost" : "movement-zero-cost-reason");
      return;
    }

    setSubmitting(true); setErrors({}); setRequestError("");
    try {
      const unitCost = String(form.unitCost).trim();
      const body = {
        locationId: form.locationId,
        movementType: form.movementType,
        quantity: form.quantity,
        reason: form.reason,
        reference: form.reference,
        ...(unitCost ? { unitCost } : {}),
        ...(isZeroCost(unitCost) && form.zeroCostReason ? { zeroCostReason: form.zeroCostReason } : {})
      };
      await apiRequest(`/products/${productId}/movements`, { method: "POST", body, csrf: true });
      navigate(`/app/products/${productId}/movements`);
    } catch (error) {
      if (error.code === "PRODUCT_NOT_FOUND") setNotFound(true);
      else {
        const fieldErrors = errorsByField(error.fields);
        setErrors(fieldErrors);
        setRequestError(error.message || "No fue posible registrar el movimiento.");
        if (fieldErrors.unitCost) focusField("movement-unit-cost");
        else if (fieldErrors.zeroCostReason) focusField("movement-zero-cost-reason");
      }
    } finally { setSubmitting(false); }
  }

  if (!session.permissions.canManageInventory) return <EmptyState title="Acceso restringido" description="No tienes permiso para registrar movimientos en este negocio." action={<Link className="button button--secondary" to={`/app/products/${productId}/movements`}>Volver al historial</Link>} />;
  if (loading) return <section className="dashboard-state"><Spinner label="Cargando opciones del movimiento" /></section>;
  if (notFound) return <EmptyState title="Producto no disponible" description="El producto fue archivado o ya no está disponible en el negocio activo." action={<Link className="button button--secondary" to="/app/products">Volver a productos</Link>} />;
  if (requestError && !data) return <Alert><div className="dashboard-error"><span>{requestError}</span><Button variant="secondary" onClick={load}>Reintentar</Button></div></Alert>;

  const help = movementHelp[form.movementType];
  return <>
    <Link to={`/app/products/${productId}/movements`} className="back-link"><ArrowLeft aria-hidden="true" />Volver al historial</Link>
    <PageHeader title="Registrar movimiento" description={`${data.product.name} · ${data.product.sku}`} />
    <Card><form className="product-form" onSubmit={submit} noValidate>
      {requestError && <Alert><span>{requestError}</span></Alert>}
      {Object.keys(errors).length > 0 && <Alert><div><strong>Revisa los campos marcados.</strong><ul>{Object.entries(errors).map(([field, message]) => <li key={field}>{message}</li>)}</ul></div></Alert>}
      <div className="product-form__fields">
        <Select id="movement-location" label="Ubicación *" value={form.locationId} onChange={(event) => update("locationId", event.target.value)} error={errors.locationId} required>{data.locations.map((location) => <option key={location.id} value={location.id}>{location.name} ({location.code})</option>)}</Select>
        {selectedLocation && <p className="local-stock" aria-live="polite">Stock local actual: <strong>{selectedLocation.stock} unidades</strong></p>}
        <Select id="movement-type" label="Tipo de movimiento *" value={form.movementType} onChange={(event) => update("movementType", event.target.value)} error={errors.movementType} required>{data.movementTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</Select>
        <Input id="movement-quantity" label={help.label} type="number" value={form.quantity} onChange={(event) => update("quantity", event.target.value)} min="0" max="1000000" step="1" inputMode="numeric" hint={help.hint} error={errors.quantity} required />
        {showsCostField && <>
          <Input id="movement-unit-cost" label={requiresFifoCost ? "Costo unitario *" : "Costo unitario (incremento FIFO)"} type="number" min="0" step="0.0001" value={form.unitCost} onChange={(event) => updateUnitCost(event.target.value)} error={errors.unitCost} hint={isFifo ? "En PEPS/FIFO el costo crea la capa de inventario. Si aún no conoces el costo, selecciona Costo no conocido." : "Obligatorio si el saldo final aumenta en FIFO."} required={requiresFifoCost} />
          {showsZeroCostReason && <Select id="movement-zero-cost-reason" label="Motivo del costo cero *" value={form.zeroCostReason} onChange={(event) => update("zeroCostReason", event.target.value)} error={errors.zeroCostReason} required={requiresZeroCostReason}><option value="">Selecciona un motivo</option><option value="no_cost_known">Costo no conocido</option></Select>}
          {showsZeroCostReason && <p className="field-help" role="note">Advertencia: el costo cero reducirá el valor valuado del inventario y puede afectar la utilidad.</p>}
        </>}
        <label className="field" htmlFor="movement-reason"><span className="field__label">Motivo *</span><textarea id="movement-reason" className="field__control" value={form.reason} onChange={(event) => update("reason", event.target.value)} minLength="5" maxLength="500" required aria-invalid={Boolean(errors.reason)} aria-describedby={errors.reason ? "movement-reason-error" : undefined} />{errors.reason && <span id="movement-reason-error" className="field__error">{errors.reason}</span>}</label>
        <Input id="movement-reference" label="Referencia (opcional)" value={form.reference} onChange={(event) => update("reference", event.target.value)} maxLength="120" error={errors.reference} />
      </div>
      <div className="product-form__actions"><Link className="button button--secondary" to={`/app/products/${productId}/movements`}>Cancelar</Link><Button type="submit" disabled={submitting}>{submitting ? "Registrando movimiento…" : "Registrar movimiento"}</Button></div>
    </form></Card>
  </>;
}
