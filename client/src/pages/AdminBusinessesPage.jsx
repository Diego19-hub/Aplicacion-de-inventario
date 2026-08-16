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

function pageNumbers(page, totalPages) {
  return Array.from({ length: totalPages }, (_, index) => index + 1)
    .filter((number) => number === 1 || number === totalPages || Math.abs(number - page) <= 1);
}

function statusLabel(status) {
  return { active: "Activo", suspended: "Suspendido", archived: "Archivado" }[status] ?? status;
}

function formatDate(value) {
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" }).format(new Date(value));
}

export function AdminBusinessesPage() {
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [q, setQ] = useState(params.get("q") ?? "");
  const [status, setStatus] = useState(params.get("status") ?? "");
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadBusinesses = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const search = new URLSearchParams(params).toString();
      setData(await apiRequest(`/admin/businesses${search ? `?${search}` : ""}`));
    } catch (requestError) {
      setError(requestError);
    } finally {
      setIsLoading(false);
    }
  }, [params]);

  useEffect(() => {
    setQ(params.get("q") ?? "");
    setStatus(params.get("status") ?? "");
  }, [params]);

  useEffect(() => {
    loadBusinesses();
  }, [loadBusinesses]);

  function updateFilters(next) {
    const search = new URLSearchParams();
    if (next.q) search.set("q", next.q);
    if (next.status) search.set("status", next.status);
    if (next.page > 1) search.set("page", String(next.page));
    setParams(search);
  }

  function submit(event) {
    event.preventDefault();
    updateFilters({ q: q.trim(), status, page: 1 });
  }

  function clear() {
    setQ("");
    setStatus("");
    setParams(new URLSearchParams());
  }

  if (isLoading) return <section className="dashboard-state"><Spinner label="Cargando negocios" /></section>;
  if (error) return <Alert><div className="dashboard-error"><span>No fue posible cargar los negocios.</span><Button variant="secondary" onClick={loadBusinesses}>Reintentar</Button></div></Alert>;

  const { businesses, filters, pagination } = data;
  const hasFilters = Boolean(filters.q || filters.status);

  return <>
    <PageHeader title="Negocios" description={`${pagination.totalItems} resultado(s) en la plataforma.`} actions={<Link className="button button--primary" to="/app/admin/businesses/new">Crear negocio</Link>} />
    <Card className="product-filter-card">
      <form className="product-filters" onSubmit={submit}>
        <Input id="admin-business-search" type="search" label="Buscar negocios" value={q} onChange={(event) => setQ(event.target.value)} placeholder="Nombre, slug, razón social o identificación fiscal" />
        <Select id="admin-business-status" label="Estado" value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">Todos los estados</option>
          <option value="active">Activos</option>
          <option value="suspended">Suspendidos</option>
          <option value="archived">Archivados</option>
        </Select>
        <div className="product-filter-actions"><Button type="submit"><Search aria-hidden="true" />Filtrar</Button><Button type="button" variant="secondary" onClick={clear}>Limpiar filtros</Button></div>
      </form>
    </Card>
    {businesses.length === 0 ? <EmptyState title={hasFilters ? "Sin coincidencias" : "Sin negocios registrados"} description={hasFilters ? "Prueba con otros filtros." : "Los negocios registrados aparecerán aquí."} action={hasFilters ? <Button variant="secondary" onClick={clear}>Limpiar filtros</Button> : null} /> : <section className="category-api-grid" aria-label="Listado de negocios">{businesses.map((business) => <Card key={business.id} className="category-api-card"><div><h2>{business.name}</h2><p className="muted">{business.slug} · {statusLabel(business.status)}</p></div><dl><div><dt>Razón social</dt><dd>{business.legalName || "Sin razón social"}</dd></div><div><dt>Identificación fiscal</dt><dd>{business.taxId || "Sin identificación"}</dd></div><div><dt>Moneda y zona horaria</dt><dd>{business.currency} · {business.timezone}</dd></div><div><dt>Miembros y productos activos</dt><dd>{business.activeMembers} · {business.activeProducts}</dd></div><div><dt>Creado</dt><dd><time dateTime={business.createdAt}>{formatDate(business.createdAt)}</time></dd></div></dl><Link className="text-link" to={`/app/admin/businesses/${business.id}`}>Ver detalle</Link></Card>)}</section>}
    {pagination.totalPages > 1 && <nav className="product-pagination" aria-label="Paginación de negocios">{pageNumbers(pagination.page, pagination.totalPages).map((page, index, pages) => <span key={page}>{index > 0 && page - pages[index - 1] > 1 && <span aria-hidden="true">…</span>}<Button variant={page === pagination.page ? "primary" : "secondary"} aria-current={page === pagination.page ? "page" : undefined} onClick={() => updateFilters({ q: filters.q, status: filters.status, page })}>{page}</Button></span>)}</nav>}
  </>;
}
