import { ArrowLeft, Search } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";

import { apiRequest } from "../api/client.js";
import { Alert } from "../components/Alert.jsx";
import { Button } from "../components/Button.jsx";
import { Card } from "../components/Card.jsx";
import { EmptyState } from "../components/EmptyState.jsx";
import { PageHeader } from "../components/PageHeader.jsx";
import { Select } from "../components/Select.jsx";
import { Spinner } from "../components/Spinner.jsx";
import { useAuth } from "../context/AuthContext.jsx";

const typeLabels = {
  opening_balance: "Saldo inicial", entry: "Entrada", exit: "Salida", adjustment: "Ajuste",
  transfer_out: "Transferencia — salida", transfer_in: "Transferencia — entrada"
};

function formatDate(value) { return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
function pageNumbers(page, total) { return Array.from({ length: total }, (_, index) => index + 1).filter((number) => number === 1 || number === total || Math.abs(number - page) <= 1); }

export function ProductMovementsPage() {
  const { productId } = useParams();
  const { session } = useAuth();
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [location, setLocation] = useState(params.get("location") ?? "");
  const [type, setType] = useState(params.get("type") ?? "");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { const query = new URLSearchParams(params).toString(); setData(await apiRequest(`/products/${productId}/movements${query ? `?${query}` : ""}`)); }
    catch (requestError) { setError(requestError); }
    finally { setLoading(false); }
  }, [params, productId]);
  useEffect(() => { load(); }, [load]);
  function update(next) { const query = new URLSearchParams(); if (next.location) query.set("location", next.location); if (next.type) query.set("type", next.type); if (next.page > 1) query.set("page", String(next.page)); setParams(query); }
  function submit(event) { event.preventDefault(); update({ location, type, page: 1 }); }
  function clear() { setLocation(""); setType(""); setParams(new URLSearchParams()); }
  if (loading) return <section className="dashboard-state"><Spinner label="Cargando movimientos" /></section>;
  if (error?.code === "PRODUCT_NOT_FOUND") return <EmptyState title="Producto no encontrado" description="El producto no está disponible en el negocio activo." action={<Link className="button button--secondary" to="/app/products">Volver a productos</Link>} />;
  if (error) return <Alert><div className="dashboard-error"><span>No fue posible cargar el historial.</span><Button variant="secondary" onClick={load}>Reintentar</Button></div></Alert>;
  const { product, movements, locations, filters, pagination } = data;
  return <>
    <Link to={`/app/products/${productId}`} className="back-link"><ArrowLeft aria-hidden="true" />Volver al producto</Link>
    <PageHeader title="Historial de movimientos" description={`${product.name} · ${product.sku} · ${product.stock} unidades`} actions={session.permissions.canManageInventory ? <Link className="button button--primary" to={`/app/products/${productId}/movements/new`}>Registrar movimiento</Link> : null} />
    <Card className="product-filter-card"><form className="product-filters" onSubmit={submit}><Select id="movement-location" label="Ubicación" value={location} onChange={(event) => setLocation(event.target.value)}><option value="">Todas las ubicaciones</option>{locations.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.code})</option>)}</Select><Select id="movement-type" label="Tipo" value={type} onChange={(event) => setType(event.target.value)}><option value="">Todos los tipos</option>{Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select><div className="product-filter-actions"><Button type="submit"><Search aria-hidden="true" />Filtrar</Button><Button variant="secondary" onClick={clear}>Limpiar filtros</Button></div></form></Card>
    <p className="muted">{pagination.totalItems} movimientos</p>
    {movements.length === 0 ? <EmptyState title={pagination.totalItems === 0 && !filters.locationId && !filters.type ? "Sin movimientos" : "Sin coincidencias"} description={pagination.totalItems === 0 && !filters.locationId && !filters.type ? "Los movimientos de este producto aparecerán aquí." : "Prueba con otros filtros."} action={filters.locationId || filters.type ? <Button variant="secondary" onClick={clear}>Limpiar filtros</Button> : null} /> : <section className="movement-list movement-list--full" aria-label="Historial de movimientos">{movements.map((movement) => <Card key={movement.id} className="movement-card"><div className="movement-card__title"><strong>{typeLabels[movement.type] ?? movement.type}</strong><time dateTime={movement.createdAt}>{formatDate(movement.createdAt)}</time></div><div><strong className={movement.quantityDelta >= 0 ? "delta delta--positive" : "delta delta--negative"}>{movement.quantityDelta >= 0 ? "+" : ""}{movement.quantityDelta}</strong><span>{movement.previousStock} → {movement.resultingStock} unidades</span></div><div><span>{movement.location.name} ({movement.location.code})</span><span>{movement.createdBy.username}</span></div><p>{movement.reason}</p>{movement.reference && <small>Referencia: {movement.reference}</small>}{movement.transferId !== null && <Link className="text-link" to={`/app/transfers/${movement.transferId}`}>Transferencia #{movement.transferId}</Link>}</Card>)}</section>}
    {pagination.totalPages > 1 && <nav className="product-pagination" aria-label="Paginación de movimientos">{pageNumbers(pagination.page, pagination.totalPages).map((page) => <Button key={page} variant={page === pagination.page ? "primary" : "secondary"} aria-current={page === pagination.page ? "page" : undefined} onClick={() => update({ location: filters.locationId ?? "", type: filters.type, page })}>{page}</Button>)}</nav>}
  </>;
}
