import { Plus, Search } from "lucide-react";
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
import { useAuth } from "../context/AuthContext.jsx";

function pageNumbers(page, totalPages) {
  return Array.from({ length: totalPages }, (_, index) => index + 1)
    .filter((number) => number === 1 || number === totalPages || Math.abs(number - page) <= 1);
}

function locationTypeLabel(type) {
  return type === "warehouse" ? "Bodega" : "Sucursal";
}

function locationStatusLabel(status) {
  return status === "active" ? "Activa" : "Inactiva";
}

export function LocationsPage() {
  const { session } = useAuth();
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [query, setQuery] = useState(params.get("q") ?? "");
  const [status, setStatus] = useState(params.get("status") ?? "active");
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState(() => getStoredViewMode("locations_view_mode"));

  const loadLocations = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const search = new URLSearchParams(params).toString();
      setData(await apiRequest(`/locations${search ? `?${search}` : ""}`));
    } catch (requestError) {
      setError(requestError);
    } finally {
      setIsLoading(false);
    }
  }, [params]);

  useEffect(() => {
    loadLocations();
  }, [loadLocations]);

  function updateFilters(next) {
    const search = new URLSearchParams();
    if (next.q) search.set("q", next.q);
    if (next.status !== "active") search.set("status", next.status);
    if (next.page > 1) search.set("page", String(next.page));
    setParams(search);
  }

  function submit(event) {
    event.preventDefault();
    updateFilters({ q: query.trim(), status, page: 1 });
  }

  function clear() {
    setQuery("");
    setStatus("active");
    setParams(new URLSearchParams());
  }

  if (isLoading) return <section className="dashboard-state"><Spinner label="Cargando ubicaciones" /></section>;
  if (error) return <Alert><div className="dashboard-error"><span>No fue posible cargar las ubicaciones.</span><Button variant="secondary" onClick={loadLocations}>Reintentar</Button></div></Alert>;

  const { locations, filters, pagination } = data;
  const hasFilters = Boolean(filters.q || filters.status !== "active");
  return <>
    <PageHeader title="Ubicaciones" description={`${pagination.totalItems} resultados`} actions={session.permissions.canDeleteInventory ? <Link className="button button--primary" to="/app/locations/new"><Plus aria-hidden="true" />Crear ubicación</Link> : null} />
    <Card className="product-filter-card">
      <form className="product-filters" onSubmit={submit}>
        <Input id="location-search" label="Buscar ubicaciones" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nombre o código" />
        <Select id="location-status" label="Estado" value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="active">Activas</option>
          <option value="inactive">Inactivas</option>
          <option value="all">Todas</option>
        </Select>
        <div className="product-filter-actions"><Button type="submit"><Search aria-hidden="true" />Buscar</Button><Button variant="secondary" onClick={clear}>Limpiar filtros</Button></div>
      </form>
    </Card>
    <ViewModeToggle value={viewMode} storageKey="locations_view_mode" onChange={setViewMode} />
    {locations.length === 0 ? <EmptyState title={hasFilters ? "Sin coincidencias" : "Sin ubicaciones activas"} description={hasFilters ? "Prueba con otros filtros." : "Las ubicaciones del negocio aparecerán aquí."} action={hasFilters ? <Button variant="secondary" onClick={clear}>Limpiar filtros</Button> : null} /> : <section className={`category-api-grid ${viewMode === "list" ? "resource-list" : ""}`} aria-label="Listado de ubicaciones">{locations.map((location) => <Card key={location.id} className="category-api-card"><div className="location-card__heading"><div><h2>{location.name}</h2><p className="muted">Código: {location.code}</p></div>{location.isDefault && <span className="status-badge">Principal</span>}</div><dl><div><dt>Tipo</dt><dd>{locationTypeLabel(location.type)}</dd></div><div><dt>Estado</dt><dd>{locationStatusLabel(location.status)}</dd></div><div><dt>Stock almacenado</dt><dd>{location.totalStock} unidades</dd></div><div><dt>Productos con stock</dt><dd>{location.positiveProductCount}</dd></div></dl><Link className="text-link" to={`/app/locations/${location.id}`}>Ver detalle</Link></Card>)}</section>}
    {pagination.totalPages > 1 && <nav className="product-pagination" aria-label="Paginación de ubicaciones">{pageNumbers(pagination.page, pagination.totalPages).map((page, index, pages) => <span key={page}>{index > 0 && page - pages[index - 1] > 1 && <span aria-hidden="true">…</span>}<Button variant={page === pagination.page ? "primary" : "secondary"} aria-current={page === pagination.page ? "page" : undefined} onClick={() => updateFilters({ q: filters.q, status: filters.status, page })}>{page}</Button></span>)}</nav>}
  </>;
}
