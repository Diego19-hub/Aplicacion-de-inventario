import { Search } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { apiRequest } from "../api/client.js";
import { Alert } from "../components/Alert.jsx";
import { Button } from "../components/Button.jsx";
import { Card } from "../components/Card.jsx";
import { EmptyState } from "../components/EmptyState.jsx";
import { Input } from "../components/Input.jsx";
import { PageHeader } from "../components/PageHeader.jsx";
import { Select } from "../components/Select.jsx";
import { Spinner } from "../components/Spinner.jsx";
import { getStoredViewMode, ViewModeToggle } from "../components/ViewModeToggle.jsx";

const PAGE_SIZE = 12;
function pages(page, total) { return Array.from({ length: total }, (_, i) => i + 1).filter((n) => n === 1 || n === total || Math.abs(n - page) <= 1); }

export function CustomersPage() {
  const [params, setParams] = useSearchParams();
  const [customers, setCustomers] = useState([]); const [query, setQuery] = useState(params.get("q") || ""); const [status, setStatus] = useState(params.get("status") || "all"); const [page, setPage] = useState(Number(params.get("page")) || 1); const [mode, setMode] = useState(() => getStoredViewMode("customers_view_mode")); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  const load = useCallback(async () => { setLoading(true); setError(""); try { const result = await apiRequest(`/customers${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ""}`); setCustomers((result.customers || []).filter((c) => status === "all" || c.status === status)); } catch (e) { setError(e.message || "No fue posible cargar los clientes."); } finally { setLoading(false); } }, [query, status]);
  useEffect(() => { load(); }, [load]);
  function submit(e) { e.preventDefault(); setPage(1); setParams({ ...(query.trim() ? { q: query.trim() } : {}), ...(status !== "all" ? { status } : {}), page: "1" }); }
  const totalPages = Math.max(1, Math.ceil(customers.length / PAGE_SIZE)); const visible = customers.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  return <div className="collections-page"><PageHeader title="Clientes" description={`${customers.length} resultados`} actions={<Link className="button button--primary" to="/app/collections/customers/new">Nuevo cliente</Link>} /><Card className="product-filter-card"><form className="product-filters" onSubmit={submit}><Input id="customer-search" label="Buscar clientes" type="search" placeholder="Nombre, teléfono o correo" value={query} onChange={(e) => setQuery(e.target.value)} /><Select id="customer-status" label="Estado" value={status} onChange={(e) => setStatus(e.target.value)}><option value="all">Todos</option><option value="active">Activos</option><option value="inactive">Inactivos</option><option value="suspended">Suspendidos</option></Select><div className="product-filter-actions"><Button type="submit"><Search aria-hidden="true" />Buscar</Button><Button variant="secondary" onClick={() => { setQuery(""); setStatus("all"); setParams({ page: "1" }); }}>Limpiar</Button></div></form></Card><ViewModeToggle value={mode} storageKey="customers_view_mode" onChange={setMode} />{loading && <section className="dashboard-state"><Spinner label="Cargando clientes" /></section>}{!loading && error && <Alert><div className="dashboard-error"><span>{error}</span><Button variant="secondary" onClick={load}>Reintentar</Button></div></Alert>}{!loading && !error && !visible.length && <EmptyState title="Sin clientes" description={customers.length ? "No hay clientes en esta página." : "Registra un cliente para comenzar."} />}{!loading && visible.length > 0 && <><section className={`category-api-grid ${mode === "list" ? "resource-list" : ""}`} aria-label="Clientes">{visible.map((customer) => <Card key={customer.id} className="category-api-card"><div><h2>{customer.name}</h2><p className="muted">{customer.phone || customer.email || "Sin contacto"}</p></div><dl><div><dt>Estado</dt><dd>{customer.status}</dd></div><div><dt>Saldo pendiente</dt><dd>{Number(customer.balance || 0).toLocaleString("es-MX", { style: "currency", currency: "MXN" })}</dd></div></dl><div className="product-actions"><Link className="text-link" to={`/app/collections/customers/${customer.id}`}>Ver estado de cuenta</Link><Link className="text-link" to={`/app/collections/customers/${customer.id}/edit`}>Editar</Link></div></Card>)}</section><nav className="product-pagination" aria-label="Paginación de clientes">{pages(page, totalPages).map((n) => <Button key={n} variant={n === page ? "primary" : "secondary"} aria-current={n === page ? "page" : undefined} onClick={() => { setPage(n); setParams({ ...(query ? { q: query } : {}), ...(status !== "all" ? { status } : {}), page: String(n) }); }}>{n}</Button>)}</nav></>}</div>;
}
