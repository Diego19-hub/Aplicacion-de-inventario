import { Bell, CheckCheck, ExternalLink, Search } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { Alert } from "../components/Alert.jsx";
import { Button } from "../components/Button.jsx";
import { Card } from "../components/Card.jsx";
import { EmptyState } from "../components/EmptyState.jsx";
import { PageHeader } from "../components/PageHeader.jsx";
import { Spinner } from "../components/Spinner.jsx";
import { apiRequest } from "../api/client.js";

const labels = { stock_alert: "Alertas de stock", collection_overdue: "Cobranza vencida", collection_due: "Cobranza próxima", purchase_received: "Compra recibida", return_registered: "Devolución registrada", inventory_damage: "Mercancía dañada", team_invitation: "Invitación al equipo", permission_change: "Cambio de permisos" };
const initial = { type: "", priority: "", status: "" };
const priorityLabels = { urgent: "URGENTE", high: "ALTA", medium: "MEDIA", normal: "NORMAL" };

export function NotificationsPage() {
  const [params, setParams] = useSearchParams();
  const [filters, setFilters] = useState({ ...initial, type: params.get("type") || "", priority: params.get("priority") || "", status: params.get("status") || "" });
  const [data, setData] = useState(null); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  const load = useCallback(async () => { setLoading(true); setError(""); try { const query = params.toString(); setData(await apiRequest(`/notifications${query ? `?${query}` : ""}`)); } catch (e) { if (e.name !== "AbortError") setError(e.message || "No fue posible cargar las notificaciones."); } finally { setLoading(false); } }, [params]);
  useEffect(() => { load(); }, [load]);
  function submit(event) { event.preventDefault(); event.stopPropagation(); const next = new URLSearchParams(); Object.entries(filters).forEach(([key, value]) => value && next.set(key, value)); setParams(next, { replace: true, preventScrollReset: true }); }
  async function mark(id) { await apiRequest(`/notifications/${id}/read`, { method: "PATCH", csrf: true }); load(); }
  async function markAll() { await apiRequest("/notifications/read-all", { method: "PATCH", csrf: true }); load(); }
  if (loading && !data) return <section className="dashboard-state"><Spinner label="Cargando notificaciones" /></section>;
  const notifications = data?.notifications || [];
  return <div className="notifications-page"><PageHeader title="Notificaciones" description="Consulta los avisos importantes del negocio." actions={<Button variant="secondary" onClick={markAll}><CheckCheck aria-hidden="true" />Marcar todas como leídas</Button>} />
    <Card><form className="notification-filters" onSubmit={submit}><label><span>Tipo</span><select value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })}><option value="">Todos</option>{Object.entries(labels).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></label><label><span>Prioridad</span><select value={filters.priority} onChange={(e) => setFilters({ ...filters, priority: e.target.value })}><option value="">Todas</option><option value="urgent">Urgente</option><option value="high">Alta</option><option value="medium">Media</option><option value="normal">Normal</option></select></label><label><span>Estado</span><select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}><option value="">Todas</option><option value="unread">No leídas</option><option value="read">Leídas</option></select></label><div className="filter-actions"><Button type="submit"><Search aria-hidden="true" />Aplicar</Button><Button type="button" variant="secondary" onClick={() => { setFilters(initial); setParams({}, { replace: true, preventScrollReset: true }); }}>Limpiar</Button></div></form></Card>
    {error && <Alert><p>{error}</p></Alert>}{notifications.length === 0 ? <Card><EmptyState title="No hay notificaciones" description="Los avisos nuevos aparecerán aquí." /></Card> : <Card><div className="notifications-list">{notifications.map((notification) => <article key={notification.id} className={`notification-item ${notification.is_read ? "notification-item--read" : ""}`}><div className="notification-item__icon"><Bell aria-hidden="true" /></div><div className="notification-item__body"><div className="notification-item__heading"><strong>{notification.title}</strong><span className={`notification-priority notification-priority--${notification.priority}`}>{notification.priority}</span></div><p>{notification.message}</p><small>{labels[notification.type] || notification.type} · {new Date(notification.created_at).toLocaleString("es-MX")}</small></div><div className="notification-item__actions">{notification.link && <Link className="button button--secondary" to={notification.link} onClick={() => !notification.is_read && mark(notification.id)}><ExternalLink aria-hidden="true" />Abrir</Link>}{!notification.is_read && <Button variant="ghost" onClick={() => mark(notification.id)}>Marcar leída</Button>}</div></article>)}</div><div className="pagination"><span>Página {data?.pagination?.page || 1} de {data?.pagination?.totalPages || 1}</span><div><Button variant="secondary" disabled={(data?.pagination?.page || 1) <= 1} onClick={() => setParams((current) => { const next = new URLSearchParams(current); next.set("page", String(Number(next.get("page") || 1) - 1)); return next; }, { preventScrollReset: true })}>Anterior</Button><Button variant="secondary" disabled={(data?.pagination?.page || 1) >= (data?.pagination?.totalPages || 1)} onClick={() => setParams((current) => { const next = new URLSearchParams(current); next.set("page", String(Number(next.get("page") || 1) + 1)); return next; }, { preventScrollReset: true })}>Siguiente</Button></div></div></Card>}
  </div>;
}
