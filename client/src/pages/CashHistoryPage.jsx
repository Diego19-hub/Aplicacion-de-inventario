import { ArrowLeft, ChevronLeft, ChevronRight, Eye, Search, X } from "lucide-react";
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

const INITIAL_FILTERS = { registerId: "", status: "", dateFrom: "", dateTo: "" };
const STATUS_LABELS = { open: "Abierta", closed: "Cerrada" };
const MOVEMENT_LABELS = {
  opening: "Apertura",
  sale: "Venta en efectivo",
  cash_in: "Entrada",
  cash_out: "Retiro",
  closing_adjustment: "Ajuste de cierre"
};

function formatMoney(value, currency) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency }).format(Number(value) || 0);
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function errorMessage(error) {
  if (error?.status === 401 || error?.code === "AUTH_REQUIRED") return "Tu sesión terminó. Inicia sesión nuevamente.";
  if (error?.status === 403 || error?.code === "FORBIDDEN") return "No tienes permisos para consultar el historial de Caja.";
  if (error?.code === "CASH_SESSION_NOT_FOUND") return "No se encontró la sesión solicitada.";
  return error?.message || "No fue posible cargar el historial de Caja.";
}

function differenceClass(value) {
  const amount = Number(value) || 0;
  return amount > 0 ? "cash-history-value--positive" : amount < 0 ? "cash-history-value--negative" : "";
}

export function CashHistoryPage() {
  const { session } = useAuth();
  const currency = session.activeBusiness?.currency || "MXN";
  const [searchParams, setSearchParams] = useSearchParams();
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [registers, setRegisters] = useState([]);
  const [data, setData] = useState(null);
  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const [movements, setMovements] = useState(null);
  const [loading, setLoading] = useState(true);
  const [movementsLoading, setMovementsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [movementsError, setMovementsError] = useState(null);
  const query = searchParams.toString();

  useEffect(() => {
    setFilters({
      registerId: searchParams.get("registerId") || "",
      status: searchParams.get("status") || "",
      dateFrom: searchParams.get("dateFrom") || "",
      dateTo: searchParams.get("dateTo") || ""
    });
  }, [searchParams]);

  const loadHistory = useCallback(async (signal) => {
    setLoading(true);
    setError(null);
    try {
      const [history, registerData] = await Promise.all([
        apiRequest(`/cash/sessions${query ? `?${query}` : ""}`, { signal }),
        apiRequest("/cash/registers", { signal })
      ]);
      setData(history);
      setRegisters(registerData?.registers ?? []);
    } catch (requestError) {
      if (requestError?.name === "AbortError" || requestError?.message?.toLowerCase().includes("aborted")) return;
      setError(requestError);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    const controller = new AbortController();
    loadHistory(controller.signal);
    return () => controller.abort();
  }, [loadHistory]);

  async function selectSession(sessionId) {
    setSelectedSessionId(sessionId);
    setMovementsLoading(true);
    setMovementsError(null);
    try {
      const result = await apiRequest(`/cash/sessions/${sessionId}/movements`);
      setMovements(result);
    } catch (requestError) {
      setMovementsError(requestError);
    } finally {
      setMovementsLoading(false);
    }
  }

  function updateFilter(event) {
    setFilters((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  function applyFilters(event) {
    event.preventDefault();
    const next = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => { if (value) next.set(key, value); });
    next.set("page", "1");
    next.set("limit", searchParams.get("limit") || "25");
    setSearchParams(next);
    setSelectedSessionId(null);
    setMovements(null);
  }

  function clearFilters() {
    setFilters(INITIAL_FILTERS);
    setSearchParams({ page: "1", limit: searchParams.get("limit") || "25" });
    setSelectedSessionId(null);
    setMovements(null);
  }

  function goToPage(page) {
    const next = new URLSearchParams(searchParams);
    next.set("page", String(page));
    setSearchParams(next);
    setSelectedSessionId(null);
    setMovements(null);
  }

  const sessions = data?.sessions ?? [];
  const pagination = data?.pagination;

  return (
    <section className="cash-history-page">
      <PageHeader
        title="Historial de caja"
        description={pagination ? `${pagination.totalItems} sesión(es) registradas` : "Consulta las sesiones y movimientos de Caja."}
        actions={<Link className="button button--secondary" to="/app/cash"><ArrowLeft aria-hidden="true" />Volver a Caja</Link>}
      />

      <Card className="cash-history-filter-card">
        <form className="cash-history-filters" onSubmit={applyFilters}>
          <Select id="cash-history-register" name="registerId" label="Caja" value={filters.registerId} onChange={updateFilter}>
            <option value="">Todas las cajas</option>
            {registers.map((register) => <option key={register.id} value={register.id}>{register.name} · {register.location?.name}</option>)}
          </Select>
          <Select id="cash-history-status" name="status" label="Estado" value={filters.status} onChange={updateFilter}>
            <option value="">Todos</option><option value="open">Abierta</option><option value="closed">Cerrada</option>
          </Select>
          <Input id="cash-history-date-from" name="dateFrom" label="Fecha inicial" type="date" value={filters.dateFrom} onChange={updateFilter} />
          <Input id="cash-history-date-to" name="dateTo" label="Fecha final" type="date" value={filters.dateTo} onChange={updateFilter} />
          <div className="cash-history-filter-actions"><Button type="submit"><Search aria-hidden="true" />Aplicar</Button><Button type="button" variant="secondary" onClick={clearFilters}><X aria-hidden="true" />Limpiar</Button></div>
        </form>
      </Card>

      {error && <Alert><div className="dashboard-error"><span>{errorMessage(error)}</span><Button variant="secondary" onClick={() => loadHistory()}>Reintentar</Button></div></Alert>}
      {loading && <section className="dashboard-state"><Spinner label="Cargando historial de Caja" /></section>}
      {!loading && !error && sessions.length === 0 && <EmptyState title="No hay sesiones de Caja" description="No se encontraron sesiones con los filtros seleccionados." />}
      {!loading && !error && sessions.length > 0 && <>
        <Card className="cash-history-table-card">
          <div className="cash-history-results"><strong>{pagination.totalItems} resultado(s)</strong><span>Ordenadas de la más reciente a la más antigua</span></div>
          <div className="cash-history-table-wrap"><table className="cash-history-table"><caption className="visually-hidden">Historial de sesiones de Caja</caption><thead><tr><th>Caja</th><th>Ubicación</th><th>Apertura</th><th>Cierre</th><th>Fondo inicial</th><th>Ventas efectivo</th><th>Entradas</th><th>Retiros</th><th>Esperado</th><th>Contado</th><th>Diferencia</th><th>Estado</th><th>Detalle</th></tr></thead><tbody>{sessions.map((cashSession) => <tr key={cashSession.id} className={selectedSessionId === cashSession.id ? "cash-history-row--selected" : ""}><th scope="row">{cashSession.register.name}</th><td>{cashSession.location.name}</td><td>{formatDate(cashSession.openedAt)}</td><td>{formatDate(cashSession.closedAt)}</td><td>{formatMoney(cashSession.openingAmount, currency)}</td><td>{formatMoney(cashSession.cashSales, currency)}</td><td className="cash-history-value--positive">{formatMoney(cashSession.totalCashIn, currency)}</td><td className="cash-history-value--negative">{formatMoney(cashSession.totalCashOut, currency)}</td><td>{formatMoney(cashSession.expectedAmount, currency)}</td><td>{formatMoney(cashSession.closingAmount, currency)}</td><td className={differenceClass(cashSession.differenceAmount)}>{formatMoney(cashSession.differenceAmount, currency)}</td><td><span className={`cash-history-status cash-history-status--${cashSession.status}`}>{STATUS_LABELS[cashSession.status] || cashSession.status}</span></td><td><Button variant="secondary" className="button--compact" onClick={() => selectSession(cashSession.id)} aria-label={`Ver movimientos de la sesión ${cashSession.id}`}><Eye aria-hidden="true" />Ver movimientos</Button></td></tr>)}</tbody></table></div>
        </Card>
        {pagination.totalPages > 1 && <nav className="product-pagination" aria-label="Paginación del historial de Caja"><Button variant="secondary" disabled={pagination.page === 1} onClick={() => goToPage(pagination.page - 1)}><ChevronLeft aria-hidden="true" />Anterior</Button><span>Página {pagination.page} de {pagination.totalPages}</span><Button variant="secondary" disabled={pagination.page === pagination.totalPages} onClick={() => goToPage(pagination.page + 1)}>Siguiente<ChevronRight aria-hidden="true" /></Button></nav>}
      </>}

      {selectedSessionId && <Card className="cash-history-movements-card"><div className="cash-history-section-heading"><div><p className="eyebrow">Sesión #{selectedSessionId}</p><h2>Movimientos de Caja</h2></div><Button variant="ghost" onClick={() => { setSelectedSessionId(null); setMovements(null); }} aria-label="Cerrar detalle"><X aria-hidden="true" /></Button></div>{movementsLoading && <Spinner label="Cargando movimientos" />}{movementsError && <Alert>{errorMessage(movementsError)}</Alert>}{!movementsLoading && !movementsError && movements?.movements?.length === 0 && <p className="cash-history-empty">Esta sesión no tiene movimientos registrados.</p>}{!movementsLoading && !movementsError && movements?.movements?.length > 0 && <div className="cash-history-movement-list">{movements.movements.map((movement) => <article className="cash-history-movement" key={movement.id}><div><strong>{MOVEMENT_LABELS[movement.movementType] || movement.movementType}</strong><span>{movement.reason}</span></div><div><strong>{formatMoney(movement.amount, currency)}</strong><span>{movement.user?.username || "—"} · {formatDate(movement.createdAt)}</span></div></article>)}</div>}</Card>}
    </section>
  );
}
