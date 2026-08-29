import { Search } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { apiRequest } from "../api/client.js";
import { Alert } from "../components/Alert.jsx";
import { Button } from "../components/Button.jsx";
import { Card } from "../components/Card.jsx";
import { EmptyState } from "../components/EmptyState.jsx";
import { PageHeader } from "../components/PageHeader.jsx";
import { Spinner } from "../components/Spinner.jsx";

const moduleLabels = { sales: "Ventas", purchases: "Compras", inventory: "Inventario", transfers: "Transferencias", returns: "Devoluciones", collections: "Cobranza", recipes: "Recetas", alerts: "Alertas", products: "Productos", members: "Miembros", costs: "Costos", cash: "Caja" };
const actionLabels = { create: "Crear", edit: "Editar", cancel: "Cancelar", delete: "Eliminar", receive: "Recibir", register_payment: "Registrar pago", change_status: "Cambiar estado", change_permissions: "Cambiar permisos" };
const initialFilters = { module: "", userId: "", action: "", reference: "", dateFrom: "", dateTo: "" };

function readFilters(params) { return Object.fromEntries(Object.keys(initialFilters).map((key) => [key, params.get(key) || ""])); }

export function AuditLogPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [filters, setFilters] = useState(() => readFilters(searchParams));
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const query = searchParams.toString();
  const load = useCallback(async () => { setLoading(true); setError(""); try { setData(await apiRequest(`/audit-log${query ? `?${query}` : ""}`)); } catch (requestError) { setError(requestError.message || "No fue posible cargar la bitácora."); } finally { setLoading(false); } }, [query]);
  useEffect(() => { load(); setFilters(readFilters(searchParams)); }, [load, query, searchParams]);
  function update(name, value) { setFilters((current) => ({ ...current, [name]: value })); }
  function apply(event) { event.preventDefault(); event.stopPropagation(); const next = new URLSearchParams(); Object.entries(filters).forEach(([key, value]) => { if (value.trim()) next.set(key, value.trim()); }); next.set("page", "1"); setSearchParams(next, { replace: true, preventScrollReset: true }); }
  function clear() { setFilters(initialFilters); setSearchParams({ page: "1" }, { replace: true, preventScrollReset: true }); }
  function page(nextPage) { const next = new URLSearchParams(searchParams); next.set("page", String(nextPage)); setSearchParams(next, { replace: true, preventScrollReset: true }); }
  if (loading && !data) return <section className="dashboard-state"><Spinner label="Cargando bitácora" /></section>;
  return <section className="audit-page"><PageHeader title="Bitácora de auditoría" description="Consulta las operaciones importantes del negocio activo." /><Card><form className="audit-filters" onSubmit={apply}><label><span>Módulo</span><select value={filters.module} onChange={(event) => update("module", event.target.value)}><option value="">Todos</option>{Object.entries(moduleLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label><span>Usuario</span><input type="text" value={filters.userId} onChange={(event) => update("userId", event.target.value)} placeholder="ID de usuario" /></label><label><span>Acción</span><select value={filters.action} onChange={(event) => update("action", event.target.value)}><option value="">Todas</option>{Object.entries(actionLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label><span>Referencia</span><input type="text" value={filters.reference} onChange={(event) => update("reference", event.target.value)} /></label><label><span>Desde</span><input type="date" value={filters.dateFrom} onChange={(event) => update("dateFrom", event.target.value)} /></label><label><span>Hasta</span><input type="date" value={filters.dateTo} onChange={(event) => update("dateTo", event.target.value)} /></label><div className="filter-actions"><Button type="submit"><Search aria-hidden="true" />Aplicar</Button><Button type="button" variant="secondary" onClick={clear}>Limpiar</Button></div></form></Card>{error && <Alert>{error}</Alert>}{!error && data?.auditLog?.length === 0 && <EmptyState title="Sin registros" description="No hay eventos de auditoría para los filtros seleccionados." />}{data?.auditLog?.length > 0 && <><Card><div className="audit-table-wrap"><table className="audit-table"><thead><tr><th>Fecha</th><th>Módulo</th><th>Acción</th><th>Referencia</th><th>Usuario</th><th>Descripción</th></tr></thead><tbody>{data.auditLog.map((entry) => <tr key={entry.id}><td>{new Date(entry.occurred_at).toLocaleString("es-MX")}</td><td>{moduleLabels[entry.module] || entry.module}</td><td>{actionLabels[entry.action] || entry.action}</td><td>{entry.reference || "—"}</td><td>{entry.username || "Sistema"}</td><td>{entry.description}</td></tr>)}</tbody></table></div></Card><nav className="product-pagination" aria-label="Paginación de auditoría"><Button variant="secondary" disabled={data.pagination.page <= 1} onClick={() => page(data.pagination.page - 1)}>Anterior</Button><span>Página {data.pagination.page} de {data.pagination.totalPages || 1}</span><Button variant="secondary" disabled={data.pagination.page >= data.pagination.totalPages} onClick={() => page(data.pagination.page + 1)}>Siguiente</Button></nav></>}</section>;
}
