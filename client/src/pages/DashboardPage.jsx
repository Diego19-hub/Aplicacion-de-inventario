import {
  BellRing,
  Boxes,
  CircleDollarSign,
  CreditCard,
  DollarSign,
  Receipt,
  TrendingUp,
  MapPin,
  Package,
  RefreshCw
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { apiRequest } from "../api/client.js";
import { Alert } from "../components/Alert.jsx";
import { Button } from "../components/Button.jsx";
import { Card } from "../components/Card.jsx";
import { EmptyState } from "../components/EmptyState.jsx";
import { MovementTrendChart } from "../components/MovementTrendChart.jsx";
import { PageHeader } from "../components/PageHeader.jsx";
import { Spinner } from "../components/Spinner.jsx";
import { useAuth } from "../context/AuthContext.jsx";

const movementLabels = {
  opening_balance: "Saldo inicial",
  entry: "Entrada",
  exit: "Salida",
  adjustment: "Ajuste",
  transfer_out: "Transferencia — salida",
  transfer_in: "Transferencia — entrada"
};

function metricCards(summary, currency) {
  return [
    { label: "Productos activos", value: summary.activeProducts, icon: Package },
    { label: "Unidades totales", value: summary.totalUnits, icon: Boxes },
    { label: "Valor de inventario", value: new Intl.NumberFormat("es-MX", { style: "currency", currency }).format(summary.inventoryValue), icon: CircleDollarSign },
    { label: "Alertas de stock", value: summary.lowStockAlerts, icon: BellRing },
    { label: "Ubicaciones activas", value: summary.activeLocations, icon: MapPin }
  ];
}

function formatDate(date) {
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(date));
}

function isAbortError(error) {
  return error?.name === "AbortError" || error?.message?.toLowerCase().includes("aborted");
}

function localDate(date) { const year = date.getFullYear(); const month = String(date.getMonth() + 1).padStart(2, "0"); const day = String(date.getDate()).padStart(2, "0"); return `${year}-${month}-${day}`; }
function periodRange(value, customFrom, customTo) {
  const end = new Date(); end.setHours(23, 59, 59, 999); const start = new Date(end);
  if (value === "today") start.setHours(0, 0, 0, 0); else if (value === "7d") start.setDate(start.getDate() - 6); else if (value === "month") start.setDate(1); else if (value === "3m") start.setMonth(start.getMonth() - 2, 1); else { return { from: customFrom || localDate(new Date(end.getFullYear(), end.getMonth(), 1)), to: customTo || localDate(end) }; }
  return { from: localDate(start), to: localDate(end) };
}
function previousRange(range) { const from = new Date(`${range.from}T00:00:00`); const to = new Date(`${range.to}T23:59:59`); const days = Math.max(1, Math.round((to - from) / 86400000) + 1); const previousTo = new Date(from); previousTo.setDate(previousTo.getDate() - 1); const previousFrom = new Date(previousTo); previousFrom.setDate(previousFrom.getDate() - days + 1); return { from: localDate(previousFrom), to: localDate(previousTo) }; }
function inRange(value, range) { const date = String(value || "").slice(0, 10); return date >= range.from && date <= range.to; }
function money(value, currency) { return new Intl.NumberFormat("es-MX", { style: "currency", currency }).format(Number(value || 0)); }
async function fetchSales(range, signal) { const first = await apiRequest(`/sales?dateFrom=${range.from}&dateTo=${range.to}&limit=50&page=1`, { signal }); const sales = [...(first.sales || [])]; for (let page = 2; page <= (first.pagination?.totalPages || 1); page += 1) { const next = await apiRequest(`/sales?dateFrom=${range.from}&dateTo=${range.to}&limit=50&page=${page}`, { signal }); sales.push(...(next.sales || [])); } return sales; }

export function DashboardPage() {
  const { session } = useAuth();
  const { activeBusiness, membership, user } = session;
  const [dashboard, setDashboard] = useState(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [period, setPeriod] = useState("1m");
  const [executivePeriod, setExecutivePeriod] = useState("month");
  const [isTrendLoading, setIsTrendLoading] = useState(false);
  const [stockAlerts, setStockAlerts] = useState([]);
  const [executive, setExecutive] = useState(null);
  const [executiveErrors, setExecutiveErrors] = useState([]);
  const [customFrom, setCustomFrom] = useState(""); const [customTo, setCustomTo] = useState("");
  const trendAbortRef = useRef(null);

  const loadDashboard = useCallback(async (selectedPeriod = period, signal) => {
    setIsLoading(true);
    setError("");
    try {
      setDashboard(await apiRequest(`/dashboard?period=${selectedPeriod}`, { signal }));
    } catch (requestError) {
      if (isAbortError(requestError)) return;
      setError(requestError.message || "No fue posible cargar el dashboard.");
    } finally {
      if (!signal || !signal.aborted) setIsLoading(false);
    }
  }, [period]);

  useEffect(() => {
    const controller = new AbortController();
    loadDashboard(period, controller.signal);
    return () => controller.abort();
  }, []);
  useEffect(() => { const controller = new AbortController(); const range = periodRange(executivePeriod, customFrom, customTo); const previous = previousRange(range); const loadExecutive = async () => { const requests = await Promise.allSettled([fetchSales(range, controller.signal), fetchSales(previous, controller.signal), apiRequest("/business-costs", { signal: controller.signal }), apiRequest("/customers", { signal: controller.signal }), apiRequest("/customer-charges", { signal: controller.signal }), apiRequest("/customer-payments", { signal: controller.signal }), apiRequest("/alerts/stock?limit=5", { signal: controller.signal })]); if (controller.signal.aborted) return; const names = ["sales", "previousSales", "costs", "customers", "charges", "payments", "alerts"]; const errors = requests.flatMap((result, index) => result.status === "rejected" && !isAbortError(result.reason) ? [names[index]] : []); setExecutiveErrors(errors); const value = (index, fallback) => requests[index].status === "fulfilled" ? requests[index].value : fallback; const sales = value(0, { sales: [] }).sales || []; const previousSales = value(1, { sales: [] }).sales || []; const costs = value(2, { costs: [] }).costs || []; const customers = value(3, { customers: [] }).customers || []; const charges = value(4, { charges: [] }).charges || []; const payments = value(5, { payments: [] }).payments || []; const alerts = value(6, { alerts: [] }).alerts || []; setStockAlerts(alerts); const periodPayments = payments.filter((payment) => inRange(payment.paidAt, range)); const revenue = sales.reduce((sum, sale) => sum + Number(sale.total || 0), 0); const previousRevenue = previousSales.reduce((sum, sale) => sum + Number(sale.total || 0), 0); const pending = customers.reduce((sum, customer) => sum + Math.max(0, Number(customer.balance || 0)), 0); const overdueCharges = charges.filter((charge) => !["paid", "cancelled"].includes(charge.status) && String(charge.dueDate).slice(0, 10) < localDate(new Date())); const overdueTotal = overdueCharges.reduce((sum, charge) => sum + Math.max(0, Number(charge.balance ?? charge.amount ?? 0)), 0); const overdueCustomers = new Set(overdueCharges.map((charge) => charge.customerId)).size; const activeCosts = costs.filter((cost) => cost.isActive !== false && (!cost.startDate || String(cost.startDate).slice(0, 10) <= range.to) && (!cost.endDate || String(cost.endDate).slice(0, 10) >= range.from)); const costTotal = activeCosts.reduce((sum, cost) => sum + Number(cost.amount || 0), 0); const labor = activeCosts.filter((cost) => cost.category === "labor").reduce((sum, cost) => sum + Number(cost.amount || 0), 0); const logistics = activeCosts.filter((cost) => cost.category === "logistics").reduce((sum, cost) => sum + Number(cost.amount || 0), 0); setExecutive({ range, sales, revenue, previousRevenue, costs: activeCosts, costTotal, labor, logistics, otherCosts: Math.max(0, costTotal - labor - logistics), customers, charges, payments, periodPayments, pending, overdueTotal, overdueCustomers }); }; loadExecutive(); return () => controller.abort(); }, [executivePeriod, customFrom, customTo]);

  async function changePeriod(event) {
    const selectedPeriod = event.target.value;
    trendAbortRef.current?.abort();
    trendAbortRef.current = new AbortController();
    setPeriod(selectedPeriod);
    setIsTrendLoading(true);
    const controller = trendAbortRef.current;
    try {
      const nextDashboard = await apiRequest(`/dashboard?period=${selectedPeriod}`, { signal: controller.signal });
      setDashboard((current) => current ? { ...current, period: nextDashboard.period, movementTrend: nextDashboard.movementTrend, totals: nextDashboard.totals } : nextDashboard);
    } catch (requestError) {
      if (!isAbortError(requestError)) setError(requestError.message || "No fue posible actualizar la gráfica.");
    } finally {
      if (trendAbortRef.current === controller) setIsTrendLoading(false);
    }
  }

  return (
    <>
      <PageHeader
        title={`Hola, ${user.username}`}
        description={`${activeBusiness.name} · Rol ${membership.role}`}
        actions={<Link to="/select-business" className="button button--secondary">Cambiar negocio</Link>}
      />
      {isLoading && <section className="dashboard-state"><Spinner label="Cargando resumen del negocio" /></section>}
      {!isLoading && error && <Alert><div className="dashboard-error"><span>{error}</span><Button variant="secondary" onClick={() => loadDashboard(period)}><RefreshCw aria-hidden="true" />Reintentar</Button></div></Alert>}
      {!isLoading && dashboard && <>
        <Card className="executive-period-card"><div><p className="eyebrow">Vista ejecutiva</p><h2>Resumen del negocio</h2><p className="muted">Consulta el desempeño financiero, operativo y de inventario del negocio activo.</p></div><div className="executive-period-controls"><label>Periodo<select value={executivePeriod} onChange={(event) => setExecutivePeriod(event.target.value)}><option value="today">Hoy</option><option value="7d">Últimos 7 días</option><option value="month">Este mes</option><option value="3m">Últimos 3 meses</option><option value="custom">Personalizado</option></select></label>{executivePeriod === "custom" && <><label>Desde<input type="date" value={customFrom} onChange={(event) => setCustomFrom(event.target.value)} /></label><label>Hasta<input type="date" value={customTo} onChange={(event) => setCustomTo(event.target.value)} /></label></>}</div></Card>
        {executiveErrors.length > 0 && <Alert variant="error"><span>No fue posible cargar algunas secciones: {executiveErrors.join(", ")}.</span></Alert>}
        {!executive ? <section className="dashboard-state"><Spinner label="Cargando resumen ejecutivo" /></section> : <>
        <section className="executive-metric-grid" aria-label="Resumen ejecutivo"><Card className="executive-metric executive-metric--sales"><DollarSign aria-hidden="true" /><span>Ventas del periodo</span><strong>{money(executive.revenue, activeBusiness.currency)}</strong><small>{executive.sales.length} ventas · {executive.previousRevenue ? `${((executive.revenue - executive.previousRevenue) / executive.previousRevenue * 100).toFixed(1)}% vs. periodo anterior` : "Sin periodo anterior"}</small></Card><Card className="executive-metric"><TrendingUp aria-hidden="true" /><span>Utilidad estimada</span><strong>{money(executive.revenue - executive.costTotal, activeBusiness.currency)}</strong><small>Estimación parcial · margen no disponible sin costos históricos de producto</small></Card><Card className="executive-metric"><Boxes aria-hidden="true" /><span>Inventario</span><strong>{money(dashboard.summary.inventoryValue, activeBusiness.currency)}</strong><small>{dashboard.summary.activeProducts} productos activos · {stockAlerts.length} alertas visibles</small></Card><Card className="executive-metric"><CreditCard aria-hidden="true" /><span>Cobranza pendiente</span><strong>{money(executive.pending, activeBusiness.currency)}</strong><small>{money(executive.overdueTotal, activeBusiness.currency)} vencido · {executive.overdueCustomers} clientes</small></Card><Card className="executive-metric"><Receipt aria-hidden="true" /><span>Gastos del periodo</span><strong>{money(executive.costTotal, activeBusiness.currency)}</strong><small>Mano de obra: {money(executive.labor, activeBusiness.currency)} · Logística: {money(executive.logistics, activeBusiness.currency)}</small></Card></section>
        <section className="dashboard-sections executive-sections"><Card><header className="section-heading"><div><p className="eyebrow">Alertas importantes</p><h2>Atención prioritaria</h2></div></header>{stockAlerts.length === 0 ? <EmptyState title="Sin alertas" description="No hay alertas importantes para mostrar." /> : <ul className="executive-alert-list">{stockAlerts.slice(0, 6).map((alert) => <li className={`executive-alert executive-alert--${alert.status}`} key={alert.thresholdId}><Link to={`/app/products/${alert.product.id}`}><strong>{alert.message || alert.status}</strong><span>{alert.product.name} · {alert.location.name}</span></Link><b>{alert.status === "overstock" ? "Media" : alert.status === "out_of_stock" ? "Urgente" : "Alta"}</b></li>)}</ul>}<Link className="text-link" to="/app/alerts">Ver todas las alertas</Link></Card><Card><header className="section-heading"><div><p className="eyebrow">Ventas</p><h2>Ventas recientes</h2></div><Link className="text-link" to="/app/sales">Ver ventas</Link></header>{executive.sales.length === 0 ? <EmptyState title="Sin ventas en el periodo" description="Las ventas aparecerán aquí cuando se registren." /> : <ul className="executive-list">{executive.sales.slice(0, 5).map((sale) => <li key={sale.id}><Link to={`/app/sales/${sale.id}`}><strong>Venta #{sale.id}</strong><span>{formatDate(sale.createdAt)} · {sale.username || "—"}</span></Link><b>{money(sale.total, activeBusiness.currency)}</b></li>)}</ul>}</Card><Card><header className="section-heading"><div><p className="eyebrow">Cobranza</p><h2>Pagos recientes</h2></div><Link className="text-link" to="/app/collections">Ver cobranza</Link></header>{executive.periodPayments.length === 0 ? <EmptyState title="Sin pagos en el periodo" description="Los abonos registrados aparecerán aquí." /> : <ul className="executive-list">{executive.periodPayments.slice(0, 5).map((payment) => <li key={payment.id}><Link to={`/app/collections/customers/${payment.customerId}`}><strong>{payment.customerName || "Cliente"}</strong><span>{payment.folio} · {formatDate(payment.paidAt)}</span></Link><b>{money(payment.amount, activeBusiness.currency)}</b></li>)}</ul>}</Card><Card><header className="section-heading"><div><p className="eyebrow">Inventario</p><h2>Productos con stock crítico</h2></div><Link className="text-link" to="/app/alerts">Ver alertas</Link></header>{stockAlerts.length === 0 ? <EmptyState title="Sin productos críticos" description="No hay productos agotados, bajos o excedentes." /> : <ul className="executive-list">{stockAlerts.slice(0, 5).map((alert) => <li key={alert.thresholdId}><Link to={`/app/products/${alert.product.id}`}><strong>{alert.product.name}</strong><span>{alert.location.name} · {alert.stock} unidades</span></Link><b className={`stock-status stock-status--${alert.status}`}>{alert.status === "overstock" ? "Excedente" : alert.status === "out_of_stock" ? "Agotado" : "Stock bajo"}</b></li>)}</ul>}</Card><Card><header className="section-heading"><div><p className="eyebrow">Gastos</p><h2>Gastos recientes</h2></div><Link className="text-link" to="/app/costs">Ver costos</Link></header>{executive.costs.length === 0 ? <EmptyState title="Sin gastos en el periodo" description="Los gastos activos aparecerán aquí." /> : <ul className="executive-list">{executive.costs.slice(0, 5).map((cost) => <li key={cost.id}><div><strong>{cost.name}</strong><span>{cost.category === "labor" ? "Mano de obra" : cost.category === "logistics" ? "Logística" : "Otros"}</span></div><b>{money(cost.amount, activeBusiness.currency)}</b></li>)}</ul>}</Card></section>
        </>}
        <section className="metric-grid" aria-label="Resumen del inventario">
          {metricCards(dashboard.summary, activeBusiness.currency).map(({ label, value, icon: Icon }) => <Card key={label} className="metric-card"><Icon aria-hidden="true" className="card-icon" /><p>{label}</p><strong>{value}</strong></Card>)}
        </section>
        <section className="dashboard-sections"><Card><header className="section-heading"><div><p className="eyebrow">Reabastecimiento</p><h2>Alertas de inventario</h2></div></header><p className="muted">Agotados: <strong>{stockAlerts.filter((alert) => alert.status === "out_of_stock").length}</strong> · Stock bajo: <strong>{stockAlerts.filter((alert) => alert.status === "low_stock").length}</strong> · Excedentes: <strong>{stockAlerts.filter((alert) => alert.status === "overstock").length}</strong></p>{stockAlerts.length === 0 ? <p className="muted">No hay alertas de stock activas.</p> : <ul className="low-stock-list">{stockAlerts.slice(0, 5).map((alert) => <li key={alert.thresholdId}><Link to={`/app/products/${alert.product.id}`}><strong>{alert.product.name}</strong><span>{alert.location.name} · {alert.message}</span></Link><strong className={`stock-status stock-status--${alert.status}`}>{alert.status === "out_of_stock" ? "Agotado" : alert.status === "overstock" ? "Excedente" : "Stock bajo"}</strong></li>)}</ul>}<Link className="text-link" to="/app/alerts">Ver todas las alertas</Link></Card></section>
        <section className="dashboard-sections">
          <Card className="dashboard-card--wide"><header className="section-heading movement-trend-header"><div><p className="eyebrow">Evolución del inventario</p><h2>Movimientos</h2></div><label className="trend-period">Periodo:<select value={period} onChange={changePeriod} disabled={isTrendLoading}><option value="1m">Último mes</option><option value="3m">Últimos 3 meses</option><option value="6m">Últimos 6 meses</option><option value="12m">Último año</option></select></label></header>{isTrendLoading && <div className="trend-loading"><Spinner label="Actualizando gráfica" /></div>}{!isTrendLoading && (dashboard.movementTrend ?? []).every((row) => !(row.entries || row.exits || row.adjustments || row.netChange)) ? <EmptyState title="Sin movimientos en este periodo" description="Los movimientos aparecerán aquí cuando se registren." /> : <MovementTrendChart data={dashboard.movementTrend ?? []} totals={dashboard.totals} />}</Card>
          <Card><header className="section-heading"><div><p className="eyebrow">Distribución</p><h2>Stock por categoría</h2></div></header>{dashboard.stockByCategory.length === 0 ? <EmptyState title="Sin categorías con stock" description="El stock por categoría aparecerá aquí." /> : <ul className="category-stock-list">{dashboard.stockByCategory.map((category) => <li key={category.id}><div><strong>{category.name}</strong><span>{category.totalStock} unidades</span></div><div className="category-stock-bar"><span style={{ width: `${Math.min(100, (category.totalStock / Math.max(dashboard.summary.totalUnits, 1)) * 100)}%` }} /></div></li>)}</ul>}</Card>
          <Card><header className="section-heading"><div><p className="eyebrow">Atención</p><h2>Productos con stock bajo</h2></div></header>{dashboard.lowStockProducts.length === 0 ? <EmptyState title="Sin productos en riesgo" description="No hay productos por debajo de su umbral configurado." /> : <ul className="low-stock-list">{dashboard.lowStockProducts.map((product) => <li key={product.id}><div><strong>{product.name}</strong><span>{product.sku} · {product.categoryName}</span></div><strong className="stock-status stock-status--low_stock">{product.totalStock} / {product.minimumStock}</strong></li>)}</ul>}</Card>
          <Card>
            <header className="section-heading"><div><p className="eyebrow">Actividad</p><h2>Movimientos recientes</h2></div></header>
            {dashboard.recentMovements.length === 0 ? <EmptyState title="Aún no hay movimientos" description="Los movimientos registrados aparecerán aquí." /> : <div className="movement-list">{dashboard.recentMovements.map((movement) => <article className="movement-row" key={movement.id}><div><strong>{movement.itemName}</strong><span>{movement.sku} · {movement.locationName} ({movement.locationCode})</span></div><div><strong className={movement.quantityDelta >= 0 ? "delta delta--positive" : "delta delta--negative"}>{movement.quantityDelta >= 0 ? "+" : ""}{movement.quantityDelta}</strong></div><div className="movement-row__title"><strong>{movementLabels[movement.movementType] ?? movement.movementType}</strong><time dateTime={movement.createdAt}>{formatDate(movement.createdAt)}</time><span>{movement.username}</span></div></article>)}</div>}
          </Card>
          <Card>
            <header className="section-heading"><div><p className="eyebrow">Distribución</p><h2>Stock por ubicación</h2></div></header>
            <ul className="location-list">{dashboard.stockByLocation.map((location) => <li key={location.id}><div><strong>{location.name}</strong><span>{location.code}</span></div><strong>{location.totalStock} unidades</strong></li>)}</ul>
          </Card>
        </section>
      </>}
    </>
  );
}
