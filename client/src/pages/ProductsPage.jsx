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
import { useAuth } from "../context/AuthContext.jsx";

function requestPath(searchParams) {
  const params = new URLSearchParams(searchParams);
  const query = params.toString();
  return `/products${query ? `?${query}` : ""}`;
}

function pageNumbers(page, totalPages) {
  return Array.from({ length: totalPages }, (_, index) => index + 1)
    .filter((number) => number === 1 || number === totalPages || Math.abs(number - page) <= 1);
}

export function ProductsPage() {
  const { session } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [category, setCategory] = useState(searchParams.get("category") ?? "");

  const loadProducts = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      setData(await apiRequest(requestPath(searchParams)));
    } catch (requestError) {
      setError(requestError.message || "No fue posible cargar los productos.");
    } finally {
      setIsLoading(false);
    }
  }, [searchParams]);

  useEffect(() => { loadProducts(); }, [loadProducts]);

  function updateFilters(next) {
    const params = new URLSearchParams();
    if (next.q) params.set("q", next.q);
    if (next.category) params.set("category", next.category);
    if (next.page > 1) params.set("page", String(next.page));
    setSearchParams(params);
  }

  function handleSubmit(event) {
    event.preventDefault();
    updateFilters({ q: query.trim(), category, page: 1 });
  }

  function clearFilters() {
    setQuery("");
    setCategory("");
    setSearchParams(new URLSearchParams());
  }

  const currency = session.activeBusiness.currency;

  return <>
    <PageHeader title="Productos" description={data ? `${data.pagination.totalItems} resultados` : "Consulta el inventario activo"} />
    <Card className="product-filter-card">
      <form className="product-filters" onSubmit={handleSubmit}>
        <Input id="product-search" label="Buscar productos" type="search" placeholder="Buscar por nombre o SKU" value={query} onChange={(event) => setQuery(event.target.value)} />
        <Select id="product-category" label="Categoría" value={category} onChange={(event) => setCategory(event.target.value)}><option value="">Todas las categorías</option>{data?.categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select>
        <div className="product-filter-actions"><Button type="submit"><Search aria-hidden="true" />Buscar</Button><Button variant="secondary" onClick={clearFilters}>Limpiar filtros</Button></div>
      </form>
    </Card>
    {isLoading && <section className="dashboard-state"><Spinner label="Cargando productos" /></section>}
    {!isLoading && error && <Alert><div className="dashboard-error"><span>{error}</span><Button variant="secondary" onClick={loadProducts}>Reintentar</Button></div></Alert>}
    {!isLoading && data && data.products.length === 0 && (data.pagination.totalItems === 0 && !data.filters.q && !data.filters.categoryId ? <EmptyState title="El inventario está vacío" description="Los productos activos aparecerán aquí cuando estén disponibles." /> : <EmptyState title="No hay coincidencias" description="Prueba con otra búsqueda o limpia los filtros." action={<Button variant="secondary" onClick={clearFilters}>Limpiar filtros</Button>} />)}
    {!isLoading && data && data.products.length > 0 && <>
      <section className="product-grid" aria-label="Lista de productos">{data.products.map((product) => <Card key={product.id} className="product-card"><div className="product-card__heading"><span className="sku-badge">{product.sku}</span><span>{product.category.name}</span></div><h2>{product.name}</h2><p className="muted">{product.brand}</p><dl><div><dt>Precio</dt><dd>{new Intl.NumberFormat("es-MX", { style: "currency", currency }).format(product.price)}</dd></div><div><dt>Existencias</dt><dd>{product.stock} unidades</dd></div></dl></Card>)}</section>
      {data.pagination.totalPages > 1 && <nav className="product-pagination" aria-label="Paginación de productos">{pageNumbers(data.pagination.page, data.pagination.totalPages).map((page, index, pages) => <span key={page}>{index > 0 && page - pages[index - 1] > 1 && <span aria-hidden="true">…</span>}<Button variant={page === data.pagination.page ? "primary" : "secondary"} onClick={() => updateFilters({ q: data.filters.q, category: data.filters.categoryId ?? "", page })} aria-current={page === data.pagination.page ? "page" : undefined}>{page}</Button></span>)}</nav>}
    </>}
  </>;
}
