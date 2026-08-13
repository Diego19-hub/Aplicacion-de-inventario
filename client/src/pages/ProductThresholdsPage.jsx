import { ArrowLeft } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiRequest } from "../api/client.js";
import { Alert } from "../components/Alert.jsx";
import { Button } from "../components/Button.jsx";
import { Card } from "../components/Card.jsx";
import { EmptyState } from "../components/EmptyState.jsx";
import { Input } from "../components/Input.jsx";
import { PageHeader } from "../components/PageHeader.jsx";
import { Spinner } from "../components/Spinner.jsx";
import { useAuth } from "../context/AuthContext.jsx";

const labels = { not_configured: "Sin configurar", out_of_stock: "Agotado", low_stock: "Stock bajo", ok: "Stock suficiente" };

export function ProductThresholdsPage() {
  const { productId } = useParams(); const { session } = useAuth();
  const [data, setData] = useState(null); const [error, setError] = useState(null); const [loading, setLoading] = useState(true); const [values, setValues] = useState({}); const [busy, setBusy] = useState({}); const [confirmDelete, setConfirmDelete] = useState(null);
  const load = useCallback(async () => { setLoading(true); setError(null); try { const next = await apiRequest(`/products/${productId}/thresholds`); setData(next); setValues(Object.fromEntries(next.locations.map((location) => [location.id, location.minimumStock ?? ""]))); } catch (requestError) { setError(requestError); } finally { setLoading(false); } }, [productId]);
  useEffect(() => { load(); }, [load]);
  async function save(location) { setBusy((x) => ({ ...x, [location.id]: true })); try { await apiRequest(`/products/${productId}/thresholds/${location.id}`, { method: "PUT", body: { minimumStock: Number(values[location.id]) }, csrf: true }); await load(); } catch (requestError) { setError(requestError); } finally { setBusy((x) => ({ ...x, [location.id]: false })); } }
  async function remove(location) { setBusy((x) => ({ ...x, [location.id]: true })); try { await apiRequest(`/products/${productId}/thresholds/${location.id}`, { method: "DELETE", csrf: true }); setConfirmDelete(null); await load(); } catch (requestError) { setError(requestError); } finally { setBusy((x) => ({ ...x, [location.id]: false })); } }
  if (!session.permissions.canManageInventory) return <EmptyState title="Acceso restringido" description="Solo owner y manager pueden configurar umbrales." />;
  if (loading) return <section className="dashboard-state"><Spinner label="Cargando configuración" /></section>;
  if (!data) return <Alert>{error?.message || "No fue posible cargar la configuración."} <Button variant="secondary" onClick={load}>Reintentar</Button></Alert>;
  return <><Link className="back-link" to={`/app/products/${productId}`}><ArrowLeft aria-hidden="true" />Volver al producto</Link><PageHeader title="Configurar alertas" description={`${data.product.name} · ${data.product.sku} · Stock total: ${data.product.stock}`} />{error && <Alert>{error.message}</Alert>}{data.locations.length === 0 ? <EmptyState title="Sin ubicaciones activas" description="No hay ubicaciones disponibles para configurar." /> : <section className="category-api-grid">{data.locations.map((location) => <Card key={location.id} className="category-api-card"><div><h2>{location.name}</h2><p className="muted">{location.code}{location.isDefault ? " · Principal" : ""}</p></div><dl><div><dt>Stock local</dt><dd>{location.stock}</dd></div><div><dt>Estado</dt><dd>{labels[location.alertStatus]}</dd></div><div><dt>Mínimo actual</dt><dd>{location.minimumStock ?? "Sin configurar"}</dd></div></dl><Input id={`minimum-${location.id}`} label="Stock mínimo" type="number" min="0" max="1000000" step="1" required value={values[location.id]} onChange={(event) => setValues((x) => ({ ...x, [location.id]: event.target.value }))} disabled={busy[location.id]} /><Button onClick={() => save(location)} disabled={busy[location.id] || values[location.id] === ""}>{busy[location.id] ? "Guardando…" : "Guardar"}</Button>{location.minimumStock !== null && (confirmDelete === location.id ? <div className="error-summary" role="alert"><p>Eliminarás esta configuración; no cambia el stock.</p><Button variant="secondary" onClick={() => setConfirmDelete(null)}>Cancelar</Button><Button variant="danger" onClick={() => remove(location)} disabled={busy[location.id]}>Confirmar eliminación</Button></div> : <Button variant="danger" onClick={() => setConfirmDelete(location.id)} disabled={busy[location.id]}>Eliminar configuración</Button>)}</Card>)}</section>}</>;
}
