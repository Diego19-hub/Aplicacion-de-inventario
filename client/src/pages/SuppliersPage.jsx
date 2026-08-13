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
import { useAuth } from "../context/AuthContext.jsx";

function pageNumbers(page, totalPages) {
  return Array.from({ length: totalPages }, (_, index) => index + 1)
    .filter((number) => number === 1 || number === totalPages || Math.abs(number - page) <= 1);
}

function statusLabel(status) {
  return status === "active" ? "Activo" : "Inactivo";
}

export function SuppliersPage() {
  const { session } = useAuth();
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [query, setQuery] = useState(params.get("q") ?? "");
  const [status, setStatus] = useState(params.get("status") ?? "active");
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadSuppliers = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const search = new URLSearchParams(params).toString();
      setData(await apiRequest(`/suppliers${search ? `?${search}` : ""}`));
    } catch (requestError) {
      setError(requestError);
    } finally {
      setIsLoading(false);
    }
  }, [params]);

  useEffect(() => {
    loadSuppliers();
  }, [loadSuppliers]);

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

  if (isLoading) return <section className="dashboard-state"><Spinner label="Cargando proveedores" /></section>;
  if (error) return <Alert><div className="dashboard-error"><span>No fue posible cargar los proveedores.</span><Button variant="secondary" onClick={loadSuppliers}>Reintentar</Button></div></Alert>;

  const { suppliers, filters, pagination } = data;
  const hasFilters = Boolean(filters.q || filters.status !== "active");
  return <>
    <PageHeader title="Proveedores" description={`${pagination.totalItems} resultados`} actions={session.permissions.canManageInventory ? <Link className="button" to="/app/suppliers/new"><Plus aria-hidden="true" />Crear proveedor</Link> : null} />
    <Card className="product-filter-card"><form className="product-filters" onSubmit={submit}><Input id="supplier-search" label="Buscar proveedores" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nombre, RFC, contacto o correo" /><Select id="supplier-status" label="Estado" value={status} onChange={(event) => setStatus(event.target.value)}><option value="active">Activos</option><option value="inactive">Inactivos</option><option value="all">Todos</option></Select><div className="product-filter-actions"><Button type="submit"><Search aria-hidden="true" />Buscar</Button><Button variant="secondary" onClick={clear}>Limpiar filtros</Button></div></form></Card>
    {suppliers.length === 0 ? <EmptyState title={hasFilters ? "Sin coincidencias" : "Sin proveedores activos"} description={hasFilters ? "Prueba con otros filtros." : "Los proveedores del negocio aparecerán aquí."} action={hasFilters ? <Button variant="secondary" onClick={clear}>Limpiar filtros</Button> : null} /> : <section className="category-api-grid" aria-label="Listado de proveedores">{suppliers.map((supplier) => <Card key={supplier.id} className="category-api-card"><div><h2>{supplier.name}</h2><p className="muted">{supplier.legalName || "Sin razón social registrada"}</p></div><dl><div><dt>Contacto</dt><dd>{supplier.contactName || "Sin contacto"}</dd></div><div><dt>Correo o teléfono</dt><dd>{supplier.email || supplier.phone || "Sin datos de contacto"}</dd></div><div><dt>RFC</dt><dd>{supplier.taxId || "Sin RFC"}</dd></div><div><dt>Estado</dt><dd>{statusLabel(supplier.status)}</dd></div></dl><Link className="text-link" to={`/app/suppliers/${supplier.id}`}>Ver detalle</Link></Card>)}</section>}
    {pagination.totalPages > 1 && <nav className="product-pagination" aria-label="Paginación de proveedores">{pageNumbers(pagination.page, pagination.totalPages).map((page, index, pages) => <span key={page}>{index > 0 && page - pages[index - 1] > 1 && <span aria-hidden="true">…</span>}<Button variant={page === pagination.page ? "primary" : "secondary"} aria-current={page === pagination.page ? "page" : undefined} onClick={() => updateFilters({ q: filters.q, status: filters.status, page })}>{page}</Button></span>)}</nav>}
  </>;
}
