import { AlertTriangle, CheckCircle2, PackageX, Search, TrendingUp } from "lucide-react";
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

const labels = { out_of_stock: "Agotado", low_stock: "Stock bajo", overstock: "Stock excedente" };
const priorityLabels = { urgent: "Urgente", high: "Alta", medium: "Media" };
const alertIcons = { out_of_stock: PackageX, low_stock: AlertTriangle, overstock: TrendingUp };

export function AlertsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState(null); const [error, setError] = useState(null); const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ q: "", category: "", location: "", supplier: "", priority: "all", status: "all" });
  const query = searchParams.toString();
  const load = useCallback(async () => { setLoading(true); setError(null); try { setData(await apiRequest(`/alerts/stock${query ? `?${query}` : ""}`)); } catch (requestError) { setError(requestError); } finally { setLoading(false); } }, [query]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    setForm({
      q: searchParams.get("q") ?? "",
      category: searchParams.get("category") ?? "",
      location: searchParams.get("location") ?? "",
      supplier: searchParams.get("supplier") ?? "",
      priority: searchParams.get("priority") ?? "all",
      status: searchParams.get("status") ?? "all"
    });
  }, [query]);
  const setFilter = (event) => setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  const applyFilters = (event) => {
    event.preventDefault();
    const next = new URLSearchParams();
    for (const [name, rawValue] of Object.entries(form)) {
      const value = rawValue.trim();
      if (value && !(name === "status" && value === "all")) next.set(name, value);
    }
    next.set("page", "1");
    setSearchParams(next);
  };
  const clearFilters = () => { setForm({ q: "", category: "", location: "", supplier: "", priority: "all", status: "all" }); setSearchParams({}); };
  const review = async (alert) => { try { await apiRequest(`/alerts/stock/${alert.thresholdId}/review`, { method: "PATCH", csrf: true }); await load(); } catch (requestError) { setError(requestError); } };
  const goto = (page) => { const next = new URLSearchParams(searchParams); next.set("page", page); setSearchParams(next); };
  return <>
    <PageHeader title="Alertas de existencias" description="Se generan cuando una ubicación con umbral configurado alcanza o baja de su mínimo." />
    {loading && <section className="dashboard-state"><Spinner label="Cargando alertas" /></section>}
    {!loading && error && <Alert><Button variant="secondary" onClick={load}>Reintentar</Button> {error.message || "No fue posible cargar las alertas."}</Alert>}
    {!loading && data && <>
      <Card>
        <form className="product-filters" onSubmit={applyFilters}>
          <Input id="alerts-q" name="q" label="Buscar producto o SKU" value={form.q} onChange={setFilter} />
          <Select id="alerts-category" name="category" label="Categoría" value={form.category} onChange={setFilter}>
            <option value="">Todas</option>
            {data.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </Select>
          <Select id="alerts-location" name="location" label="Ubicación" value={form.location} onChange={setFilter}>
            <option value="">Todas</option>
            {data.locations.map((location) => <option key={location.id} value={location.id}>{location.name} ({location.code})</option>)}
          </Select>
          <Select id="alerts-status" name="status" label="Estado" value={form.status} onChange={setFilter}>
            <option value="all">Todas</option><option value="out_of_stock">Agotado</option><option value="low_stock">Stock bajo</option><option value="overstock">Stock excedente</option>
          </Select>
          <Select id="alerts-supplier" name="supplier" label="Proveedor" value={form.supplier} onChange={setFilter}><option value="">Todos</option>{(data.suppliers || []).map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</Select>
          <Select id="alerts-priority" name="priority" label="Prioridad" value={form.priority} onChange={setFilter}><option value="all">Todas</option><option value="urgent">Urgente</option><option value="high">Alta</option><option value="medium">Media</option></Select>
          <div className="product-filter-actions"><Button type="submit"><Search aria-hidden="true" />Filtrar</Button><Button type="button" variant="secondary" onClick={clearFilters}>Limpiar filtros</Button></div>
        </form>
      </Card>
      <div className="stock-alert-legend" aria-label="Leyenda de estados de inventario"><span className="stock-alert-legend__item stock-alert-legend__item--urgent"><PackageX aria-hidden="true" />Rojo = atención urgente</span><span className="stock-alert-legend__item stock-alert-legend__item--review"><TrendingUp aria-hidden="true" />Amarillo = revisar exceso</span><span className="stock-alert-legend__item stock-alert-legend__item--normal"><CheckCircle2 aria-hidden="true" />Verde = inventario correcto</span></div><p className="muted">{data.pagination.totalItems} alerta{data.pagination.totalItems === 1 ? "" : "s"} encontrada{data.pagination.totalItems === 1 ? "" : "s"}.</p>
      {data.alerts.length === 0 ? <EmptyState title={data.pagination.totalItems === 0 && !data.filters.q && !data.filters.categoryId && !data.filters.locationId ? "Sin alertas activas" : "Sin coincidencias"} description={data.pagination.totalItems === 0 ? "Puede que no existan umbrales configurados o que las existencias estén por encima del mínimo." : "Prueba con filtros diferentes."} /> : <section className="category-api-grid" aria-label="Alertas de existencias">{data.alerts.map((alert) => { const Icon = alertIcons[alert.status] || AlertTriangle; const priority = priorityLabels[alert.priority] || ""; return <Card key={alert.thresholdId} className={`category-api-card stock-alert-card stock-alert-card--${alert.status}`}><div><p className="stock-alert-label"><Icon aria-hidden="true" />{labels[alert.status]?.toUpperCase()} · {priority.toUpperCase()}</p><h2><Link className="text-link" to={`/app/products/${alert.product.id}`}>{alert.product.name}</Link></h2><p className="muted">{alert.product.sku} · {alert.product.category.name}</p><p>{alert.message}{alert.status === "overstock" ? `. Hay ${alert.stock} unidades y el máximo configurado es ${alert.maximumStock}. Excedente: ${alert.overstockQuantity} unidades` : alert.status === "out_of_stock" ? ". Producto agotado." : `. Faltan ${Math.max(0, alert.minimumStock - alert.stock)} unidades para alcanzar el mínimo.`}</p></div><dl><div><dt>Ubicación</dt><dd>{alert.location.name} ({alert.location.code})</dd></div><div><dt>Stock / mínimo / máximo</dt><dd>{alert.stock} / {alert.minimumStock} / {alert.maximumStock ?? "—"}</dd></div><div><dt>{alert.status === "overstock" ? "Excedente" : "Sugerencia"}</dt><dd>{alert.status === "overstock" ? `${alert.overstockQuantity} unidades` : alert.suggestedQuantity}</dd></div><div><dt>Proveedor</dt><dd>{alert.supplier?.name || "Sin proveedor"}</dd></div></dl><div className="card-actions"><Link className="button button--secondary" to={`/app/products/${alert.product.id}`}>Ver producto</Link>{data.permissions.canManageThresholds && <><Link className="button button--secondary" to={`/app/products/${alert.product.id}/thresholds`}>Configurar mínimo</Link>{alert.suggestedQuantity > 0 && <Link className="button" to={`/app/transactions/entries/new?productId=${alert.product.id}&quantity=${alert.suggestedQuantity}&supplier=${encodeURIComponent(alert.supplier?.name || "")}`}>Crear entrada sugerida</Link>}<Button variant="secondary" onClick={() => review(alert)}>Marcar revisada</Button></>}</div></Card>; })}</section>}
      {data.pagination.totalPages > 1 && <nav className="product-pagination" aria-label="Paginación de alertas"><Button variant="secondary" disabled={data.pagination.page === 1} onClick={() => goto(data.pagination.page - 1)}>Anterior</Button><span aria-current="page">Página {data.pagination.page} de {data.pagination.totalPages}</span><Button variant="secondary" disabled={data.pagination.page === data.pagination.totalPages} onClick={() => goto(data.pagination.page + 1)}>Siguiente</Button></nav>}
      {data.permissions.canManageThresholds && <p className="muted">La configuración de umbrales estará disponible desde los productos.</p>}
    </>}
  </>;
}
