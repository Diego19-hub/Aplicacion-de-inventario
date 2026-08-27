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
import { Spinner } from "../components/Spinner.jsx";
import { getStoredViewMode, ViewModeToggle } from "../components/ViewModeToggle.jsx";
import { useAuth } from "../context/AuthContext.jsx";

function pageNumbers(page, totalPages) {
  return Array.from({ length: totalPages }, (_, index) => index + 1)
    .filter((number) => number === 1 || number === totalPages || Math.abs(number - page) <= 1);
}

export function CategoriesPage() {
  const { session } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [viewMode, setViewMode] = useState(() => getStoredViewMode("categories_view_mode"));

  const loadCategories = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const search = new URLSearchParams(searchParams).toString();
      setData(await apiRequest(`/categories${search ? `?${search}` : ""}`));
    } catch (requestError) {
      setError(requestError.message || "No fue posible cargar las categorías.");
    } finally {
      setIsLoading(false);
    }
  }, [searchParams]);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  function updateFilters(next) {
    const params = new URLSearchParams();
    if (next.q) params.set("q", next.q);
    if (next.page > 1) params.set("page", String(next.page));
    setSearchParams(params);
  }

  function submit(event) {
    event.preventDefault();
    updateFilters({ q: query.trim(), page: 1 });
  }

  function clear() {
    setQuery("");
    setSearchParams(new URLSearchParams());
  }

  return <>
    <PageHeader title="Categorías" description={data ? `${data.pagination.totalItems} resultados` : "Organiza el inventario por categorías"} actions={session.permissions.canManageInventory ? <Link className="button button--primary" to="/app/categories/new">Crear categoría</Link> : null} />
    <Card className="product-filter-card"><form className="category-filters" onSubmit={submit}><Input id="category-search" label="Buscar categorías" type="search" value={query} placeholder="Buscar por nombre" onChange={(event) => setQuery(event.target.value)} /><div className="product-filter-actions"><Button type="submit"><Search aria-hidden="true" />Buscar</Button><Button variant="secondary" onClick={clear}>Limpiar</Button></div></form></Card>
    <ViewModeToggle value={viewMode} storageKey="categories_view_mode" onChange={setViewMode} />
    {isLoading && <section className="dashboard-state"><Spinner label="Cargando categorías" /></section>}
    {!isLoading && error && <Alert><div className="dashboard-error"><span>{error}</span><Button variant="secondary" onClick={loadCategories}>Reintentar</Button></div></Alert>}
    {!isLoading && data && data.categories.length === 0 && (data.pagination.totalItems === 0 && !data.filters.q ? <EmptyState title="No hay categorías" description="Las categorías del negocio aparecerán aquí." /> : <EmptyState title="Sin coincidencias" description="Prueba con otra búsqueda o limpia el filtro." action={<Button variant="secondary" onClick={clear}>Limpiar</Button>} />)}
    {!isLoading && data && data.categories.length > 0 && <>{viewMode === "list" ? <Card className="product-list-card"><div className="product-table-wrap"><table className="product-table"><caption className="visually-hidden">Categorías</caption><thead><tr><th>Nombre</th><th>Descripción</th><th>Activos</th><th>Archivados</th><th>Existencias</th><th>Acciones</th></tr></thead><tbody>{data.categories.map((category) => <tr key={category.id}><th scope="row">{category.name}</th><td>{category.description || "Sin descripción."}</td><td>{category.activeProductCount}</td><td>{category.archivedProductCount}</td><td>{category.totalStock} unidades</td><td><Link className="text-link" to={`/app/categories/${category.id}`}>Ver detalle</Link></td></tr>)}</tbody></table></div></Card> : <section className="category-api-grid" aria-label="Categorías en tarjetas">{data.categories.map((category) => <Card key={category.id} className="category-api-card"><h2>{category.name}</h2><p className="muted">{category.description || "Sin descripción."}</p><dl><div><dt>Productos activos</dt><dd>{category.activeProductCount}</dd></div><div><dt>Productos archivados</dt><dd>{category.archivedProductCount}</dd></div><div><dt>Existencias activas</dt><dd>{category.totalStock} unidades</dd></div></dl><Link className="text-link" to={`/app/categories/${category.id}`}>Ver detalle</Link></Card>)}</section>}{data.pagination.totalPages > 1 && <nav className="product-pagination" aria-label="Paginación de categorías">{pageNumbers(data.pagination.page, data.pagination.totalPages).map((page, index, pages) => <span key={page}>{index > 0 && page - pages[index - 1] > 1 && <span aria-hidden="true">…</span>}<Button variant={page === data.pagination.page ? "primary" : "secondary"} aria-current={page === data.pagination.page ? "page" : undefined} onClick={() => updateFilters({ q: data.filters.q, page })}>{page}</Button></span>)}</nav>}</>}
  </>;
}
