import { ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, Factory, Filter, Info, ReceiptText, Search, SlidersHorizontal } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
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
import { HelpInfoPanel } from "../components/HelpInfoPanel.jsx";

const labels = { entry: "Entrada", exit: "Salida", adjustment: "Ajuste", transfer: "Transferencia", sale: "Venta", production: "Producción", return: "Devolución", damage: "Daño", loss: "Pérdida" };
const icons = { entry: ArrowDownToLine, exit: ArrowUpFromLine, adjustment: SlidersHorizontal, transfer: ArrowLeftRight, sale: ReceiptText, production: Factory };
const money = (value) => value === null ? "—" : new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(value));
const initialFilters = { q: "", type: "", dateFrom: "", dateTo: "", locationId: "", userId: "" };

function filtersFromSearchParams(searchParams) {
  return Object.fromEntries(Object.keys(initialFilters).map((key) => [key, searchParams.get(key) ?? ""]));
}

function filtersEqual(left, right) {
  return Object.keys(initialFilters).every((key) => left[key] === right[key]);
}

function buildSearchParams(filters, page) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (String(value).trim()) params.set(key, String(value).trim());
  });
  if (page > 1) params.set("page", String(page));
  return params;
}

function TransactionHelpCard() {
  return <HelpInfoPanel moduleKey="transactions" />;
  return <Card className="transaction-help-card"><div className="transaction-help-card__heading"><Info aria-hidden="true" /><div><p className="eyebrow">Guía rápida</p><h2>¿Cómo funcionan las transacciones?</h2></div></div><p>Las transacciones registran todos los cambios realizados en el inventario y permiten consultar quién hizo cada operación, cuándo ocurrió y qué productos fueron afectados.</p><div className="transaction-help-types">{[["entry", "Registra productos recibidos de un proveedor y aumenta el inventario."], ["exit", "Registra productos vendidos o retirados del inventario."], ["adjustment", "Corrige diferencias: incremento por productos adicionales o disminución por pérdidas, daños o caducidad."], ["transfer", "Mueve productos entre ubicaciones."], ["sale", "Descuenta productos y registra la operación comercial."], ["production", "Descuenta ingredientes y aumenta los productos fabricados."]].map(([type, text]) => { const Icon = icons[type]; return <div key={type}><Icon aria-hidden="true" /><span><strong>{labels[type]}:</strong> {text}</span></div>; })}</div><div className="transaction-help-practices"><strong>Buenas prácticas</strong><ul><li>Usa Entrada cuando recibas mercancía.</li><li>Usa Venta cuando vendas un producto.</li><li>Usa Transferencia cuando cambies un producto de ubicación.</li><li>Usa Ajuste solo para diferencias, pérdidas o correcciones.</li><li>Usa Producción para fabricar mediante una receta.</li></ul></div><p className="transaction-help-important"><strong>Importante:</strong> cada operación actualiza el inventario dentro de una transacción segura. Si ocurre un error, se revierte toda la operación para evitar saldos incorrectos.</p></Card>;
}

export function TransactionsPage() {
  const { transactionId } = useParams(); const { session } = useAuth(); const canManage = ["owner", "manager"].includes(session.membership?.role); const [searchParams, setSearchParams] = useSearchParams();
  const urlState = searchParams.toString();
  const [draftFilters, setDraftFilters] = useState(() => filtersFromSearchParams(searchParams));
  const [appliedFilters, setAppliedFilters] = useState(() => filtersFromSearchParams(searchParams));
  const [page, setPage] = useState(() => Number(searchParams.get("page") || 1));
  const [transactions, setTransactions] = useState([]); const [options, setOptions] = useState({ locations: [], users: [] }); const [totalPages, setTotalPages] = useState(0); const [detail, setDetail] = useState(null); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  useEffect(() => {
    const nextFilters = filtersFromSearchParams(searchParams);
    const nextPage = Number(searchParams.get("page") || 1);
    setDraftFilters((current) => filtersEqual(current, nextFilters) ? current : nextFilters);
    setAppliedFilters((current) => filtersEqual(current, nextFilters) ? current : nextFilters);
    setPage((current) => current === nextPage ? current : nextPage);
  }, [urlState, searchParams]);
  const load = useCallback(async () => { setLoading(true); setError(""); try { if (transactionId) { const result = await apiRequest(`/transactions/${transactionId}`); setDetail(result.transaction); } else { const query = buildSearchParams(appliedFilters, page).toString(); const [result, filterOptions] = await Promise.all([apiRequest(`/transactions${query ? `?${query}` : ""}`), apiRequest("/transactions/options")]); setTransactions(result.transactions ?? []); setTotalPages(Number(result.pagination?.totalPages ?? 0)); setOptions(filterOptions); } } catch (requestError) { setError(requestError.message || "No fue posible cargar las transacciones."); } finally { setLoading(false); } }, [appliedFilters, page, transactionId]);
  useEffect(() => { load(); }, [load]);
  function updateUrl(filters, nextPage) { setSearchParams(buildSearchParams(filters, nextPage), { replace: true, preventScrollReset: true }); }
  function applyFilters() { setAppliedFilters(draftFilters); setPage(1); updateUrl(draftFilters, 1); }
  function handleSubmit(event) { event.preventDefault(); event.stopPropagation(); applyFilters(); }
  function handleKeyDown(event) { if (event.key !== "Enter") return; event.preventDefault(); event.stopPropagation(); applyFilters(); }
  function updateDraftFilter(name, value) { setDraftFilters((current) => ({ ...current, [name]: value })); }
  function clearFilters() { setDraftFilters(initialFilters); setAppliedFilters(initialFilters); setPage(1); updateUrl(initialFilters, 1); }
  function goToPage(nextPage) { setPage(nextPage); updateUrl(appliedFilters, nextPage); }
  if (loading) return <section className="dashboard-state"><Spinner label="Cargando transacciones" /></section>;
  if (error) return <section className="transactions-page"><Alert>{error}</Alert><Button variant="secondary" onClick={load}>Reintentar</Button></section>;
  if (transactionId && detail) return <TransactionDetail transaction={detail} />;
  return <section className="transactions-page"><PageHeader title="Transacciones" description="Consulta en un solo lugar las operaciones de inventario, ventas, transferencias y producción." actions={canManage && <div className="transactions-header-actions"><Link className="button button--primary" to="/app/transactions/entries/new">Nueva entrada</Link><Link className="button button--secondary" to="/app/transactions/adjustments/new">Nuevo ajuste</Link></div>} /><TransactionHelpCard /><Card><form className="transactions-filters" onSubmit={handleSubmit}><Input id="transactions-q" name="q" label="Buscar" placeholder="Producto, SKU o referencia" type="text" value={draftFilters.q ?? ""} onChange={(event) => updateDraftFilter("q", event.target.value)} onKeyDown={handleKeyDown} /><Select id="transactions-type" label="Tipo" value={draftFilters.type ?? ""} onChange={(event) => updateDraftFilter("type", event.target.value)}><option value="">Todos</option>{Object.entries(labels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Select><Input id="transactions-from" label="Desde" type="date" value={draftFilters.dateFrom ?? ""} onChange={(event) => updateDraftFilter("dateFrom", event.target.value)} /><Input id="transactions-to" label="Hasta" type="date" value={draftFilters.dateTo ?? ""} onChange={(event) => updateDraftFilter("dateTo", event.target.value)} /><Select id="transactions-location" label="Ubicación" value={draftFilters.locationId ?? ""} onChange={(event) => updateDraftFilter("locationId", event.target.value)}><option value="">Todas</option>{options.locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</Select><Select id="transactions-user" label="Usuario" value={draftFilters.userId ?? ""} onChange={(event) => updateDraftFilter("userId", event.target.value)}><option value="">Todos</option>{options.users.map((user) => <option key={user.id} value={user.id}>{user.username}</option>)}</Select><div className="filter-actions"><Button type="submit" className="filter-apply-button"><Search aria-hidden="true" /><span>Aplicar</span></Button><Button type="button" variant="secondary" className="filter-clear-button" onClick={clearFilters}>Limpiar</Button></div></form></Card>{transactions.length === 0 ? <EmptyState title="Sin transacciones" description="No hay operaciones que coincidan con los filtros seleccionados." /> : <><Card className="transactions-table-card"><div className="transactions-table-wrap"><table className="transactions-table"><thead><tr><th>Fecha</th><th>Tipo</th><th>Referencia</th><th>Producto</th><th>Cantidad</th><th>Origen</th><th>Destino</th><th>Usuario</th><th>Costo</th><th>Estado</th></tr></thead><tbody>{transactions.map((transaction) => <TransactionRow key={transaction.id} transaction={transaction} />)}</tbody></table></div></Card><div className="transactions-cards">{transactions.map((transaction) => <TransactionCard key={transaction.id} transaction={transaction} />)}</div><Pagination page={page} totalPages={totalPages} onPageChange={goToPage} /></>}</section>;
}
function TransactionRow({ transaction }) { const Icon = icons[transaction.type] || Filter; return <tr><td><Link to={`/app/transactions/${transaction.id}`}>{new Date(transaction.date).toLocaleString("es-MX")}</Link></td><td><span className="transaction-type"><Icon aria-hidden="true" />{labels[transaction.type]}</span></td><td>{transaction.reference || "—"}</td><td><strong>{transaction.product.name}</strong><small>{transaction.product.sku}</small></td><td className={transaction.quantity < 0 ? "transaction-negative" : ""}>{transaction.quantity > 0 ? "+" : ""}{transaction.quantity}</td><td>{transaction.origin?.name || transaction.location?.name || "—"}</td><td>{transaction.destination?.name || "—"}</td><td>{transaction.user.username}</td><td>{money(transaction.cost)}</td><td>{transaction.status === "completed" ? "Completada" : transaction.status}</td></tr>; }
function TransactionCard({ transaction }) { return <Link className="transaction-card" to={`/app/transactions/${transaction.id}`}><strong>{transaction.product.name}</strong><span>{labels[transaction.type]} · {new Date(transaction.date).toLocaleDateString("es-MX")}</span><span>SKU: {transaction.product.sku}</span><span>Referencia: {transaction.reference || "—"}</span><b>Cantidad: {transaction.quantity}</b><span>{transaction.origin?.name || transaction.location?.name || "—"}{transaction.destination ? ` → ${transaction.destination.name}` : ""}</span><span>Costo: {money(transaction.cost)} · {transaction.user.username}</span></Link>; }
function TransactionDetail({ transaction }) { return <section className="transactions-page"><PageHeader title="Detalle de transacción" description="Información de la operación registrada." actions={<Link className="button button--secondary" to="/app/transactions">Volver a transacciones</Link>} /><Card className="transaction-detail"><h2>{labels[transaction.type]}</h2><dl><div><dt>Producto</dt><dd>{transaction.product.name} · {transaction.product.sku}</dd></div><div><dt>Fecha</dt><dd>{new Date(transaction.date).toLocaleString("es-MX")}</dd></div><div><dt>Referencia</dt><dd>{transaction.reference || "—"}</dd></div><div><dt>Cantidad</dt><dd>{transaction.quantity}</dd></div><div><dt>Costo</dt><dd>{money(transaction.cost)}</dd></div><div><dt>Estado</dt><dd>{transaction.status}</dd></div><div><dt>Ubicación origen</dt><dd>{transaction.origin?.name || transaction.location?.name || "—"}</dd></div><div><dt>Ubicación destino</dt><dd>{transaction.destination?.name || "—"}</dd></div><div><dt>Usuario responsable</dt><dd>{transaction.user.username}</dd></div><div><dt>Observaciones</dt><dd>{transaction.reason || "—"}</dd></div></dl></Card></section>; }
function Pagination({ page, totalPages, onPageChange }) { if (totalPages <= 1) return null; return <nav className="transactions-pagination" aria-label="Paginación de transacciones"><Button variant="secondary" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>Anterior</Button><span>Página {page} de {totalPages}</span><Button variant="secondary" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>Siguiente</Button></nav>; }
