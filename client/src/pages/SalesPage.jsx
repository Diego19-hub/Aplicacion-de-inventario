import { Eye, ReceiptText, Search } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { apiRequest } from "../api/client.js";
import { Alert } from "../components/Alert.jsx";
import { Button } from "../components/Button.jsx";
import { Card } from "../components/Card.jsx";
import { EmptyState } from "../components/EmptyState.jsx";
import { Input } from "../components/Input.jsx";
import { InfoTip } from "../components/InfoTip.jsx";
import { PageHeader } from "../components/PageHeader.jsx";
import { Select } from "../components/Select.jsx";
import { Spinner } from "../components/Spinner.jsx";
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
  const [form, setForm] = useState(INITIAL_FILTERS);
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
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
    setForm(Object.fromEntries(Object.keys(INITIAL_FILTERS).map((key) => [key, searchParams.get(key) ?? ""])));
  }, [query, searchParams]);

  function updateFilter(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  function applyFilters(event) {
    event.preventDefault();
    const next = new URLSearchParams();
    Object.entries(form).forEach(([key, value]) => {
      if (value.trim()) next.set(key, value.trim());
    });
    next.set("page", "1");
    next.set("limit", searchParams.get("limit") || "25");
    setSearchParams(next);
  }

  function clearFilters() {
    setForm(INITIAL_FILTERS);
    setSearchParams({ page: "1", limit: searchParams.get("limit") || "25" });
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
      <form className="sales-filters" onSubmit={applyFilters}>
        <Input id="sales-search" name="q" label={<span>Buscar venta o usuario <InfoTip title="Filtros" content="Usa la búsqueda, método, estado o fechas para encontrar ventas más rápido." /></span>} type="search" placeholder="Número de venta o usuario" value={form.q} onChange={updateFilter} />
        <Select id="sales-payment" name="paymentMethod" label={<span>Método de pago <InfoTip title="Método de pago" content="Indica cómo se cobró la venta: efectivo, tarjeta o transferencia." /></span>} value={form.paymentMethod} onChange={updateFilter}>
          <option value="">Todos</option><option value="cash">Efectivo</option><option value="card">Tarjeta</option><option value="transfer">Transferencia</option>
        </Select>
        <Select id="sales-status" name="status" label="Estado" value={form.status} onChange={updateFilter}>
          <option value="">Todos</option><option value="completed">Completada</option><option value="cancelled">Cancelada</option>
        </Select>
        <Input id="sales-date-from" name="dateFrom" label="Fecha inicial" type="date" value={form.dateFrom} onChange={updateFilter} />
        <Input id="sales-date-to" name="dateTo" label="Fecha final" type="date" value={form.dateTo} onChange={updateFilter} />
        <div className="sales-filter-actions">
          <Button type="submit"><Search aria-hidden="true" />Aplicar</Button>
          <Button type="button" variant="secondary" onClick={clearFilters}>Limpiar</Button>
        </div>
      </form>
    </Card>

    {isLoading && <section className="dashboard-state"><Spinner label="Cargando ventas" /></section>}
    {!isLoading && error && <Alert><div className="dashboard-error"><span>{error}</span><Button variant="secondary" onClick={loadSales}>Reintentar</Button></div></Alert>}
    {!isLoading && data && sales.length === 0 && <EmptyState title="No hay ventas" description="No se encontraron ventas con los filtros seleccionados." />}
    {!isLoading && data && sales.length > 0 && <>
      <Card className="sales-table-card">
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
      </Card>
      {pagination.totalPages > 1 && <nav className="product-pagination" aria-label="Paginación de ventas">
        <Button variant="secondary" disabled={pagination.page === 1} onClick={() => goToPage(pagination.page - 1)}>Anterior</Button>
        {pageNumbers(pagination.page, pagination.totalPages).map((page) => <Button key={page} variant={page === pagination.page ? "primary" : "secondary"} onClick={() => goToPage(page)} aria-current={page === pagination.page ? "page" : undefined}>{page}</Button>)}
        <Button variant="secondary" disabled={pagination.page === pagination.totalPages} onClick={() => goToPage(pagination.page + 1)}>Siguiente</Button>
      </nav>}
    </>}
  </>;
}
