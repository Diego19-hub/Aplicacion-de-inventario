import { ArrowLeft, Search } from "lucide-react";
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

function formatDate(value) { return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
function requestPath(params) { const query = new URLSearchParams(params).toString(); return `/products/archived${query ? `?${query}` : ""}`; }
function pages(page, total) { return Array.from({ length: total }, (_, index) => index + 1).filter((number) => number === 1 || number === total || Math.abs(number - page) <= 1); }

export function ArchivedProductsPage() {
  const { session } = useAuth();
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [query, setQuery] = useState(params.get("q") ?? "");
  const [category, setCategory] = useState(params.get("category") ?? "");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => { setLoading(true); setError(""); try { setData(await apiRequest(requestPath(params))); } catch (requestError) { setError(requestError.message || "No fue posible cargar los productos archivados."); } finally { setLoading(false); } }, [params]);
  useEffect(() => { load(); }, [load]);
  function update(next) { const value = new URLSearchParams(); if (next.q) value.set("q", next.q); if (next.category) value.set("category", next.category); if (next.page > 1) value.set("page", String(next.page)); setParams(value); }
  function submit(event) { event.preventDefault(); update({ q: query.trim(), category, page: 1 }); }
  function clear() { setQuery(""); setCategory(""); setParams(new URLSearchParams()); }
  if (!session.permissions.canDeleteInventory) return <EmptyState title="Acceso restringido" description="Solo la persona propietaria puede consultar productos archivados." action={<Link className="button button--secondary" to="/app/products">Volver a productos</Link>} />;
  return <>
    <Link to="/app/products" className="back-link"><ArrowLeft aria-hidden="true" />Productos activos</Link>
    <PageHeader title="Productos archivados" description={data ? `${data.pagination.totalItems} resultados` : "Consulta productos retirados de los listados activos"} />
    <Card className="product-filter-card"><form className="product-filters" onSubmit={submit}><Input id="archived-product-search" label="Buscar productos archivados" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nombre o SKU" /><Select id="archived-product-category" label="Categoría" value={category} onChange={(event) => setCategory(event.target.value)}><option value="">Todas las categorías</option>{data?.categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select><div className="product-filter-actions"><Button type="submit"><Search aria-hidden="true" />Buscar</Button><Button variant="secondary" onClick={clear}>Limpiar filtros</Button></div></form></Card>
    {loading && <section className="dashboard-state"><Spinner label="Cargando productos archivados" /></section>}
    {!loading && error && <Alert><div className="dashboard-error"><span>{error}</span><Button variant="secondary" onClick={load}>Reintentar</Button></div></Alert>}
    {!loading && data && data.products.length === 0 && <EmptyState title={data.pagination.totalItems === 0 && !data.filters.q && !data.filters.categoryId ? "No hay productos archivados" : "No hay coincidencias"} description={data.pagination.totalItems === 0 && !data.filters.q && !data.filters.categoryId ? "Los productos archivados aparecerán aquí." : "Prueba con otros filtros."} action={data.filters.q || data.filters.categoryId ? <Button variant="secondary" onClick={clear}>Limpiar filtros</Button> : null} />}
    {!loading && data?.products.length > 0 && <><section className="product-grid" aria-label="Productos archivados">{data.products.map((product) => <Card key={product.id} className="product-card"><div className="product-card__heading"><span className="sku-badge">{product.sku}</span><span>{product.category.name}</span></div><h2>{product.name}</h2><p className="muted">{product.brand}</p><dl><div><dt>Existencias</dt><dd>{product.stock} unidades</dd></div><div><dt>Archivado</dt><dd><time dateTime={product.archivedAt}>{formatDate(product.archivedAt)}</time></dd></div></dl><p className="muted">Motivo: {product.reason}</p><Link className="text-link" to={`/app/products/${product.id}/archived`}>Ver detalle</Link></Card>)}</section>{data.pagination.totalPages > 1 && <nav className="product-pagination" aria-label="Paginación de archivados">{pages(data.pagination.page, data.pagination.totalPages).map((page) => <Button key={page} variant={page === data.pagination.page ? "primary" : "secondary"} aria-current={page === data.pagination.page ? "page" : undefined} onClick={() => update({ q: data.filters.q, category: data.filters.categoryId ?? "", page })}>{page}</Button>)}</nav>}</>}
  </>;
}
