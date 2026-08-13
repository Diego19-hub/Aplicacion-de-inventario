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

const initialForm = { locationId: "", movementType: "entry", quantity: "", reason: "", reference: "" };
const movementHelp = {
  entry: { label: "Unidades que ingresan *", hint: "Indica cuántas unidades ingresan a la ubicación." },
  exit: { label: "Unidades que salen *", hint: "Indica cuántas unidades salen de la ubicación." },
  adjustment: { label: "Saldo local final *", hint: "Indica el saldo final deseado para esta ubicación; el sistema registrará la diferencia." }
};

function errorsByField(fields = []) { return Object.fromEntries(fields.map((field) => [field.field, field.message])); }

export function NewProductMovementPage() {
  const { productId } = useParams(); const { session } = useAuth(); const navigate = useNavigate();
  const [data, setData] = useState(null); const [form, setForm] = useState(initialForm); const [errors, setErrors] = useState({}); const [requestError, setRequestError] = useState(""); const [loading, setLoading] = useState(true); const [submitting, setSubmitting] = useState(false); const [notFound, setNotFound] = useState(false);
  const load = useCallback(async () => { if (!session.permissions.canManageInventory) { setLoading(false); return; } setLoading(true); setRequestError(""); setNotFound(false); try { const response = await apiRequest(`/products/${productId}/movements/form-options`); setData(response); setForm((current) => ({ ...current, locationId: current.locationId || String(response.locations[0]?.id ?? "") })); } catch (error) { if (error.code === "PRODUCT_NOT_FOUND") setNotFound(true); else setRequestError(error.message || "No fue posible cargar las opciones del movimiento."); } finally { setLoading(false); } }, [productId, session.permissions.canManageInventory]);
  useEffect(() => { load(); }, [load]);
  const selectedLocation = useMemo(() => data?.locations.find((location) => location.id === Number(form.locationId)) ?? null, [data, form.locationId]);
  function update(field, value) { setForm((current) => ({ ...current, [field]: value })); setErrors((current) => { const next = { ...current }; delete next[field]; return next; }); }
  async function submit(event) { event.preventDefault(); if (submitting) return; setSubmitting(true); setErrors({}); setRequestError(""); try { await apiRequest(`/products/${productId}/movements`, { method: "POST", body: form, csrf: true }); navigate(`/app/products/${productId}/movements`); } catch (error) { if (error.code === "PRODUCT_NOT_FOUND") setNotFound(true); else { setErrors(errorsByField(error.fields)); setRequestError(error.message || "No fue posible registrar el movimiento."); } } finally { setSubmitting(false); } }
  if (!session.permissions.canManageInventory) return <EmptyState title="Acceso restringido" description="No tienes permiso para registrar movimientos en este negocio." action={<Link className="button button--secondary" to={`/app/products/${productId}/movements`}>Volver al historial</Link>} />;
  if (loading) return <section className="dashboard-state"><Spinner label="Cargando opciones del movimiento" /></section>;
  if (notFound) return <EmptyState title="Producto no disponible" description="El producto fue archivado o ya no está disponible en el negocio activo." action={<Link className="button button--secondary" to="/app/products">Volver a productos</Link>} />;
  if (requestError && !data) return <Alert><div className="dashboard-error"><span>{requestError}</span><Button variant="secondary" onClick={load}>Reintentar</Button></div></Alert>;
  const help = movementHelp[form.movementType];
  return <>
    <Link to={`/app/products/${productId}/movements`} className="back-link"><ArrowLeft aria-hidden="true" />Volver al historial</Link>
    <PageHeader title="Registrar movimiento" description={`${data.product.name} · ${data.product.sku}`} />
    <Card><form className="product-form" onSubmit={submit} noValidate>{requestError && <Alert><span>{requestError}</span></Alert>}{Object.keys(errors).length > 0 && <Alert><div><strong>Revisa los campos marcados.</strong><ul>{Object.entries(errors).map(([field, message]) => <li key={field}>{message}</li>)}</ul></div></Alert>}<div className="product-form__fields"><Select id="movement-location" label="Ubicación *" value={form.locationId} onChange={(event) => update("locationId", event.target.value)} error={errors.locationId} required>{data.locations.map((location) => <option key={location.id} value={location.id}>{location.name} ({location.code})</option>)}</Select>{selectedLocation && <p className="local-stock" aria-live="polite">Stock local actual: <strong>{selectedLocation.stock} unidades</strong></p>}<Select id="movement-type" label="Tipo de movimiento *" value={form.movementType} onChange={(event) => update("movementType", event.target.value)} error={errors.movementType} required>{data.movementTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</Select><Input id="movement-quantity" label={help.label} type="number" value={form.quantity} onChange={(event) => update("quantity", event.target.value)} min="0" max="1000000" step="1" inputMode="numeric" hint={help.hint} error={errors.quantity} required /><label className="field" htmlFor="movement-reason"><span className="field__label">Motivo *</span><textarea id="movement-reason" className="field__control" value={form.reason} onChange={(event) => update("reason", event.target.value)} minLength="5" maxLength="500" required aria-invalid={Boolean(errors.reason)} aria-describedby={errors.reason ? "movement-reason-error" : undefined} />{errors.reason && <span id="movement-reason-error" className="field__error">{errors.reason}</span>}</label><Input id="movement-reference" label="Referencia (opcional)" value={form.reference} onChange={(event) => update("reference", event.target.value)} maxLength="120" error={errors.reference} /></div><div className="product-form__actions"><Link className="button button--secondary" to={`/app/products/${productId}/movements`}>Cancelar</Link><Button type="submit" disabled={submitting}>{submitting ? "Registrando movimiento…" : "Registrar movimiento"}</Button></div></form></Card>
  </>;
}
