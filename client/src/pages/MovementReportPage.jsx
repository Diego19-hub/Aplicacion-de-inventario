import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { apiRequest } from "../api/client.js";
import { downloadCsv } from "../api/download.js";
import { Alert } from "../components/Alert.jsx";
import { Button } from "../components/Button.jsx";
import { Card } from "../components/Card.jsx";
import { EmptyState } from "../components/EmptyState.jsx";
import { Input } from "../components/Input.jsx";
import { PageHeader } from "../components/PageHeader.jsx";
import { Select } from "../components/Select.jsx";
import { Spinner } from "../components/Spinner.jsx";

const labels = { opening_balance: "Saldo inicial", entry: "Entrada", exit: "Salida", adjustment: "Ajuste", transfer_out: "Transferencia — salida", transfer_in: "Transferencia — entrada" };

export function MovementReportPage({
  title = "Movimientos",
  description = "Historial global del inventario por ubicación."
}) {
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(null); const [error, setError] = useState(null); const [loading, setLoading] = useState(true); const [downloading, setDownloading] = useState(false);
  const [form, setForm] = useState({ q: "", dateFrom: "", dateTo: "", location: "", user: "", movementType: "" });
  const query = params.toString();
  const load = useCallback(async () => { setLoading(true); setError(null); try { setData(await apiRequest(`/reports/movements${query ? `?${query}` : ""}`)); } catch (requestError) { setError(requestError); } finally { setLoading(false); } }, [query]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => setForm({ q: params.get("q") ?? "", dateFrom: params.get("dateFrom") ?? "", dateTo: params.get("dateTo") ?? "", location: params.get("location") ?? "", user: params.get("user") ?? "", movementType: params.get("movementType") ?? "" }), [query]);
  const submit = (event) => { event.preventDefault(); const next = new URLSearchParams(); Object.entries(form).forEach(([key, value]) => value && next.set(key, value)); next.set("page", "1"); setParams(next); };
  const go = (page) => { const next = new URLSearchParams(params); next.set("page", page); setParams(next); };
  const download = async () => { if (downloading) return; setDownloading(true); setError(null); try { const next = new URLSearchParams(params); next.delete("page"); await downloadCsv(`/reports/movements.csv${next.toString() ? `?${next}` : ""}`, "movimientos.csv"); } catch (requestError) { setError(requestError); } finally { setDownloading(false); } };
  return <><PageHeader title={title} description={description} actions={<Button onClick={download} disabled={downloading}>{downloading ? "Exportando…" : "Exportar CSV"}</Button>} />{loading && <Spinner label="Cargando reporte" />}{error && <Alert>{error.message}<Button onClick={load}>Reintentar</Button></Alert>}{data && <><Card><form className="product-filters" onSubmit={submit}><Input id="move-q" label="Buscar" value={form.q} onChange={(event) => setForm({ ...form, q: event.target.value })} /><Input id="move-from" label="Fecha inicial" type="date" value={form.dateFrom} onChange={(event) => setForm({ ...form, dateFrom: event.target.value })} /><Input id="move-to" label="Fecha final" type="date" value={form.dateTo} onChange={(event) => setForm({ ...form, dateTo: event.target.value })} /><Select id="move-location" label="Ubicación" value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })}><option value="">Todas</option>{data.locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</Select><Select id="move-user" label="Usuario" value={form.user} onChange={(event) => setForm({ ...form, user: event.target.value })}><option value="">Todos</option>{data.users.map((user) => <option key={user.id} value={user.id}>{user.username}</option>)}</Select><Select id="move-type" label="Tipo" value={form.movementType} onChange={(event) => setForm({ ...form, movementType: event.target.value })}><option value="">Todos</option>{Object.entries(labels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Select><Button type="submit">Filtrar</Button><Button type="button" variant="secondary" onClick={() => setParams({})}>Limpiar filtros</Button></form></Card><p className="muted">{data.pagination.totalItems} resultado(s).</p>{data.movements.length === 0 ? <EmptyState title={data.pagination.totalItems === 0 ? "Sin movimientos" : "Sin coincidencias"} description="Ajusta los filtros." /> : <section className="category-api-grid">{data.movements.map((movement) => <Card key={movement.id} className="category-api-card"><div><strong>{labels[movement.type]}</strong><time>{new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(new Date(movement.createdAt))}</time></div><p><Link className="text-link" to={movement.product.status === "archived" ? `/app/products/${movement.product.id}/archived` : `/app/products/${movement.product.id}`}>{movement.product.name}</Link> · {movement.product.sku}</p><dl><div><dt>Ubicación</dt><dd>{movement.location.name} ({movement.location.code})</dd></div><div><dt>Cambio</dt><dd>{movement.quantityDelta > 0 ? "+" : ""}{movement.quantityDelta}</dd></div><div><dt>Saldo</dt><dd>{movement.previousStock} → {movement.resultingStock}</dd></div><div><dt>Usuario</dt><dd>{movement.createdBy.username}</dd></div></dl><p>{movement.reason}{movement.reference && ` · ${movement.reference}`}</p>{movement.transferId !== null && <Link className="text-link" to={`/app/transfers/${movement.transferId}`}>Transferencia #{movement.transferId}</Link>}</Card>)}</section>}{data.pagination.totalPages > 1 && <nav className="product-pagination"><Button disabled={data.pagination.page === 1} onClick={() => go(data.pagination.page - 1)}>Anterior</Button><span aria-current="page">Página {data.pagination.page} de {data.pagination.totalPages}</span><Button disabled={data.pagination.page === data.pagination.totalPages} onClick={() => go(data.pagination.page + 1)}>Siguiente</Button></nav>}</>}</>;
}
