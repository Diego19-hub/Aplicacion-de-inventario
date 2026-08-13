import { AlertTriangle, Search } from "lucide-react";
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

const labels = { out_of_stock: "Agotado", low_stock: "Stock bajo" };

export function AlertsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState(null); const [error, setError] = useState(null); const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ q: "", category: "", location: "", status: "all" });
  const query = searchParams.toString();
  const load = useCallback(async () => { setLoading(true); setError(null); try { setData(await apiRequest(`/alerts/stock${query ? `?${query}` : ""}`)); } catch (requestError) { setError(requestError); } finally { setLoading(false); } }, [query]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    setForm({
      q: searchParams.get("q") ?? "",
      category: searchParams.get("category") ?? "",
      location: searchParams.get("location") ?? "",
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
  const clearFilters = () => { setForm({ q: "", category: "", location: "", status: "all" }); setSearchParams({}); };
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
            <option value="all">Todas</option><option value="out_of_stock">Agotado</option><option value="low_stock">Stock bajo</option>
          </Select>
          <div className="product-filter-actions"><Button type="submit"><Search aria-hidden="true" />Filtrar</Button><Button type="button" variant="secondary" onClick={clearFilters}>Limpiar filtros</Button></div>
        </form>
      </Card>
      <p className="muted">{data.pagination.totalItems} alerta{data.pagination.totalItems === 1 ? "" : "s"} encontrada{data.pagination.totalItems === 1 ? "" : "s"}.</p>
      {data.alerts.length === 0 ? <EmptyState title={data.pagination.totalItems === 0 && !data.filters.q && !data.filters.categoryId && !data.filters.locationId ? "Sin alertas activas" : "Sin coincidencias"} description={data.pagination.totalItems === 0 ? "Puede que no existan umbrales configurados o que las existencias estén por encima del mínimo." : "Prueba con filtros diferentes."} /> : <section className="category-api-grid" aria-label="Alertas de existencias">{data.alerts.map((alert) => <Card key={alert.thresholdId} className="category-api-card"><div><p className="eyebrow">{labels[alert.status]}</p><h2><Link className="text-link" to={`/app/products/${alert.product.id}`}>{alert.product.name}</Link></h2><p className="muted">{alert.product.sku} · {alert.product.category.name}</p></div><dl><div><dt>Ubicación</dt><dd>{alert.location.name} ({alert.location.code})</dd></div><div><dt>Stock local</dt><dd>{alert.stock}</dd></div><div><dt>Mínimo</dt><dd>{alert.minimumStock}</dd></div><div><dt>Estado</dt><dd><AlertTriangle aria-hidden="true" /> {labels[alert.status]}</dd></div></dl></Card>)}</section>}
      {data.pagination.totalPages > 1 && <nav className="product-pagination" aria-label="Paginación de alertas"><Button variant="secondary" disabled={data.pagination.page === 1} onClick={() => goto(data.pagination.page - 1)}>Anterior</Button><span aria-current="page">Página {data.pagination.page} de {data.pagination.totalPages}</span><Button variant="secondary" disabled={data.pagination.page === data.pagination.totalPages} onClick={() => goto(data.pagination.page + 1)}>Siguiente</Button></nav>}
      {data.permissions.canManageThresholds && <p className="muted">La configuración de umbrales estará disponible desde los productos.</p>}
    </>}
  </>;
}
