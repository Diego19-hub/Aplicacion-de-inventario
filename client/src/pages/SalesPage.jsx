import { Eye, ReceiptText, Search } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { apiRequest } from "../api/client.js";
import { Alert } from "../components/Alert.jsx";
import { Button } from "../components/Button.jsx";
import { Card } from "../components/Card.jsx";
import { EmptyState } from "../components/EmptyState.jsx";
import { InfoTip } from "../components/InfoTip.jsx";
import { PageHeader } from "../components/PageHeader.jsx";
import { Spinner } from "../components/Spinner.jsx";
import { getStoredViewMode, ViewModeToggle } from "../components/ViewModeToggle.jsx";
import { useAuth } from "../context/AuthContext.jsx";

const PAYMENT_LABELS = { cash: "Efectivo", card: "Tarjeta", transfer: "Transferencia" };
const STATUS_LABELS = { completed: "Completada", cancelled: "Cancelada" };
const INITIAL_FILTERS = { q: "", paymentMethod: "", status: "", dateFrom: "", dateTo: "" };

const dateFormatter = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" });

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Fecha no disponible" : dateFormatter.format(date);
}

function pageNumbers(page, totalPages) {
  return Array.from({ length: totalPages }, (_, index) => index + 1)
    .filter((number) => number === 1 || number === totalPages || Math.abs(number - page) <= 1);
}

export function SalesPage() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [draftFilters, setDraftFilters] = useState(INITIAL_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState(INITIAL_FILTERS);
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [viewMode, setViewMode] = useState(() => getStoredViewMode("sales_view_mode"));
  const query = searchParams.toString();
  const currency = session.activeBusiness?.currency || "MXN";
  const moneyFormatter = new Intl.NumberFormat("es-MX", { style: "currency", currency });

  const loadSales = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      setData(await apiRequest(`/sales${query ? `?${query}` : ""}`));
    } catch (requestError) {
      setError(requestError.message || "No fue posible cargar las ventas.");
    } finally {
      setIsLoading(false);
    }
  }, [query]);

  useEffect(() => { loadSales(); }, [loadSales]);

  useEffect(() => {
    const nextFilters = Object.fromEntries(Object.keys(INITIAL_FILTERS).map((key) => [key, searchParams.get(key) ?? ""]));
    setDraftFilters(nextFilters);
    setAppliedFilters(nextFilters);
  }, [query, searchParams]);

  function updateFilter(event) {
    const { name, value } = event.target;
    if (import.meta.env.DEV) console.log("[SALES FILTER CHANGE]", value);
    setDraftFilters((current) => ({ ...current, [name]: value }));
  }

  function applyFilters() {
    if (import.meta.env.DEV) console.log("[SALES SUBMIT]");
    const next = new URLSearchParams();
    Object.entries(draftFilters).forEach(([key, value]) => {
      if (value.trim()) next.set(key, value.trim());
    });
    next.set("page", "1");
    next.set("limit", searchParams.get("limit") || "25");
    setAppliedFilters(draftFilters);
    setSearchParams(next, { replace: true, preventScrollReset: true });
  }

  function handleSubmit(event) {
    event.preventDefault();
    event.stopPropagation();
    applyFilters();
  }

  function clearFilters() {
    setDraftFilters(INITIAL_FILTERS);
    setAppliedFilters(INITIAL_FILTERS);
    setSearchParams({ page: "1", limit: searchParams.get("limit") || "25" }, { replace: true, preventScrollReset: true });
  }

  function goToPage(page) {
    const next = new URLSearchParams(searchParams);
    next.set("page", String(page));
    setSearchParams(next);
  }

  const sales = data?.sales ?? [];
  const pagination = data?.pagination;

  function openSale(saleId) {
    navigate(`/app/sales/${saleId}`);
  }

  return <>
    <PageHeader
      title="Ventas"
      description={data ? `${pagination.totalItems} venta(s) registradas` : "Consulta el historial de ventas del negocio activo."}
      actions={<Link className="button button--primary" to="/app/point-of-sale"><ReceiptText aria-hidden="true" />Ir al punto de venta</Link>}
    />

    <Card className="sales-filter-card">
      <form className="sales-filters" onSubmit={handleSubmit}>
        <div className="sales-filter-fields">
          <label className="sales-filter-field" htmlFor="sales-search">
            <span>Buscar venta o usuario <InfoTip title="Filtros" content="Usa la búsqueda, método, estado o fechas para encontrar ventas más rápido." /></span>
            <input id="sales-search" name="q" type="text" placeholder="Buscar venta o usuario" value={draftFilters.q ?? ""} onChange={updateFilter} />
          </label>
          <label className="sales-filter-field" htmlFor="sales-payment">
            <span>Método de pago <InfoTip title="Método de pago" content="Indica cómo se cobró la venta: efectivo, tarjeta o transferencia." /></span>
            <select id="sales-payment" name="paymentMethod" value={draftFilters.paymentMethod ?? ""} onChange={updateFilter}>
              <option value="">Todos</option><option value="cash">Efectivo</option><option value="card">Tarjeta</option><option value="transfer">Transferencia</option>
            </select>
          </label>
          <label className="sales-filter-field" htmlFor="sales-status">
            <span>Estado</span>
            <select id="sales-status" name="status" value={draftFilters.status ?? ""} onChange={updateFilter}>
              <option value="">Todos</option><option value="completed">Completada</option><option value="cancelled">Cancelada</option>
            </select>
          </label>
          <label className="sales-filter-field" htmlFor="sales-date-from">
            <span>Fecha inicial</span>
            <input id="sales-date-from" name="dateFrom" type="date" value={draftFilters.dateFrom ?? ""} onChange={updateFilter} />
          </label>
          <label className="sales-filter-field" htmlFor="sales-date-to">
            <span>Fecha final</span>
            <input id="sales-date-to" name="dateTo" type="date" value={draftFilters.dateTo ?? ""} onChange={updateFilter} />
          </label>
        </div>
        <div className="sales-filter-actions">
          <button type="submit" className="button button--primary sales-apply-button"><Search aria-hidden="true" /><span>Aplicar</span></button>
          <button type="button" className="button button--secondary sales-clear-button" onClick={clearFilters}>Limpiar</button>
        </div>
      </form>
    </Card>
    <ViewModeToggle value={viewMode} storageKey="sales_view_mode" onChange={setViewMode} />

    {isLoading && <section className="dashboard-state"><Spinner label="Cargando ventas" /></section>}
    {!isLoading && error && <Alert><div className="dashboard-error"><span>{error}</span><Button variant="secondary" onClick={loadSales}>Reintentar</Button></div></Alert>}
    {!isLoading && data && sales.length === 0 && <EmptyState title="No hay ventas" description="No se encontraron ventas con los filtros seleccionados." />}
    {!isLoading && data && sales.length > 0 && <>
      {viewMode === "list" ? <Card className="sales-table-card">
        <div className="sales-results-heading"><strong>{pagination.totalItems} resultado(s)</strong><span>Historial de ventas <InfoTip title="Historial de ventas" content="Muestra operaciones de venta y cobros. Los movimientos de inventario muestran entradas, salidas y ajustes de existencias." /></span></div>
        <div className="sales-table-wrap">
          <table className="sales-table">
            <caption className="visually-hidden">Historial de ventas</caption>
            <thead><tr><th scope="col">Venta</th><th scope="col">Fecha</th><th scope="col">Usuario</th><th scope="col">Ubicación</th><th scope="col">Método</th><th scope="col">Artículos</th><th scope="col">Total</th><th scope="col">Estado</th><th scope="col">Acciones</th></tr></thead>
            <tbody>{sales.map((sale) => <tr key={sale.id} tabIndex="0" role="link" aria-label={`Ver detalle de la venta #${sale.id}`} onClick={() => openSale(sale.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openSale(sale.id); } }}>
              <th scope="row"><Link className="text-link" to={`/app/sales/${sale.id}`} onClick={(event) => event.stopPropagation()}>#{sale.id}</Link></th>
              <td><time dateTime={sale.createdAt}>{formatDate(sale.createdAt)}</time></td>
              <td>{sale.username || "—"}</td>
              <td>{sale.location?.name || "—"}{sale.location?.code ? ` (${sale.location.code})` : ""}</td>
              <td>{PAYMENT_LABELS[sale.paymentMethod] || sale.paymentMethod}</td>
              <td>{sale.itemCount ?? 0}</td>
              <td className="sales-table__total">{moneyFormatter.format(Number(sale.total) || 0)}</td>
              <td><span className={`sales-status sales-status--${sale.status}`}>{STATUS_LABELS[sale.status] || sale.status}</span></td>
              <td className="sales-table__actions"><Link className="button button--secondary button--compact" to={`/app/sales/${sale.id}`} aria-label={`Ver detalle de la venta #${sale.id}`} onClick={(event) => event.stopPropagation()}><Eye aria-hidden="true" />Ver detalle</Link></td>
            </tr>)}</tbody>
          </table>
        </div>
      </Card> : <section className="category-api-grid" aria-label="Ventas en tarjetas">{sales.map((sale) => <Card key={sale.id} className="category-api-card"><div><h2>Venta #{sale.id}</h2><p className="muted"><time dateTime={sale.createdAt}>{formatDate(sale.createdAt)}</time></p></div><dl><div><dt>Usuario</dt><dd>{sale.username || "—"}</dd></div><div><dt>Ubicación</dt><dd>{sale.location?.name || "—"}</dd></div><div><dt>Método</dt><dd>{PAYMENT_LABELS[sale.paymentMethod] || sale.paymentMethod}</dd></div><div><dt>Artículos</dt><dd>{sale.itemCount ?? 0}</dd></div><div><dt>Total</dt><dd>{moneyFormatter.format(Number(sale.total) || 0)}</dd></div><div><dt>Estado</dt><dd><span className={`sales-status sales-status--${sale.status}`}>{STATUS_LABELS[sale.status] || sale.status}</span></dd></div></dl><Link className="button button--secondary button--compact" to={`/app/sales/${sale.id}`}><Eye aria-hidden="true" />Ver detalle</Link></Card>)}</section>}
      {pagination.totalPages > 1 && <nav className="product-pagination" aria-label="Paginación de ventas">
        <Button variant="secondary" disabled={pagination.page === 1} onClick={() => goToPage(pagination.page - 1)}>Anterior</Button>
        {pageNumbers(pagination.page, pagination.totalPages).map((page) => <Button key={page} variant={page === pagination.page ? "primary" : "secondary"} onClick={() => goToPage(page)} aria-current={page === pagination.page ? "page" : undefined}>{page}</Button>)}
        <Button variant="secondary" disabled={pagination.page === pagination.totalPages} onClick={() => goToPage(pagination.page + 1)}>Siguiente</Button>
      </nav>}
    </>}
  </>;
}
