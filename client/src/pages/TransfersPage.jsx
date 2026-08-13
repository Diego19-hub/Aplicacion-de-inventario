import { ArrowRight, Plus, Search } from "lucide-react";
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

function formatDate(value) {
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function pageNumbers(page, total) {
  return Array.from({ length: total }, (_, index) => index + 1)
    .filter((number) => number === 1 || number === total || Math.abs(number - page) <= 1);
}

export function TransfersPage() {
  const { session } = useAuth();
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [query, setQuery] = useState(params.get("q") ?? "");
  const [location, setLocation] = useState(params.get("location") ?? "");
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const search = new URLSearchParams(params).toString();
      setData(await apiRequest(`/transfers${search ? `?${search}` : ""}`));
    } catch (requestError) {
      setError(requestError);
    } finally {
      setIsLoading(false);
    }
  }, [params]);

  useEffect(() => {
    load();
  }, [load]);

  function update(next) {
    const search = new URLSearchParams();
    if (next.q) search.set("q", next.q);
    if (next.location) search.set("location", next.location);
    if (next.page > 1) search.set("page", String(next.page));
    setParams(search);
  }

  function submit(event) {
    event.preventDefault();
    update({ q: query.trim(), location, page: 1 });
  }

  function clear() {
    setQuery("");
    setLocation("");
    setParams(new URLSearchParams());
  }

  if (isLoading) return <section className="dashboard-state"><Spinner label="Cargando transferencias" /></section>;
  if (error) return <Alert><div className="dashboard-error"><span>No fue posible cargar las transferencias.</span><Button variant="secondary" onClick={load}>Reintentar</Button></div></Alert>;

  const { transfers, locations, filters, pagination } = data;
  const hasFilters = Boolean(filters.q || filters.locationId);
  return <>
    <PageHeader title="Transferencias" description="Movimientos atómicos entre ubicaciones." actions={session.permissions.canManageInventory ? <Link className="button button--primary" to="/app/transfers/new"><Plus aria-hidden="true" />Nueva transferencia</Link> : null} />
    <Card className="product-filter-card"><form className="product-filters transfer-filters" onSubmit={submit}><Input id="transfer-search" label="Buscar transferencia" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Producto, SKU o referencia" /><Select id="transfer-location" label="Ubicación" value={location} onChange={(event) => setLocation(event.target.value)}><option value="">Todas las ubicaciones</option>{locations.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.code})</option>)}</Select><div className="product-filter-actions"><Button type="submit"><Search aria-hidden="true" />Buscar</Button><Button variant="secondary" onClick={clear}>Limpiar filtros</Button></div></form></Card>
    <p className="muted">{pagination.totalItems} transferencias</p>
    {transfers.length === 0 ? <EmptyState title={hasFilters ? "Sin coincidencias" : "Sin transferencias"} description={hasFilters ? "Prueba con otros filtros." : "Las transferencias entre ubicaciones aparecerán aquí."} action={hasFilters ? <Button variant="secondary" onClick={clear}>Limpiar filtros</Button> : null} /> : <section className="transfer-list" aria-label="Listado de transferencias">{transfers.map((transfer) => <Card key={transfer.id} className="transfer-card"><div className="transfer-card__header"><div><Link className="transfer-card__product" to={`/app/transfers/${transfer.id}`}>{transfer.product.name}</Link><span>{transfer.product.sku}</span></div><strong>{transfer.quantity} unidades</strong></div><div className="transfer-route"><span>{transfer.fromLocation.name} ({transfer.fromLocation.code})</span><ArrowRight aria-hidden="true" /><span>{transfer.toLocation.name} ({transfer.toLocation.code})</span></div><div className="transfer-card__meta"><span>{transfer.createdBy.username}</span><time dateTime={transfer.createdAt}>{formatDate(transfer.createdAt)}</time>{transfer.reference && <span>Ref. {transfer.reference}</span>}</div><p>{transfer.reason}</p><Link className="text-link" to={`/app/transfers/${transfer.id}`}>Ver detalle</Link></Card>)}</section>}
    {pagination.totalPages > 1 && <nav className="product-pagination" aria-label="Paginación de transferencias">{pageNumbers(pagination.page, pagination.totalPages).map((page) => <Button key={page} variant={page === pagination.page ? "primary" : "secondary"} aria-current={page === pagination.page ? "page" : undefined} onClick={() => update({ q: filters.q, location: filters.locationId ?? "", page })}>{page}</Button>)}</nav>}
  </>;
}
