import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { apiRequest } from "../api/client.js";
import { Alert } from "../components/Alert.jsx";
import { Button } from "../components/Button.jsx";
import { Card } from "../components/Card.jsx";
import { EmptyState } from "../components/EmptyState.jsx";
import { PageHeader } from "../components/PageHeader.jsx";
import { Select } from "../components/Select.jsx";
import { Spinner } from "../components/Spinner.jsx";
import { useAuth } from "../context/AuthContext.jsx";

export function CollectionsPage() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null); const [filter, setFilter] = useState("all"); const [alerts, setAlerts] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => { setLoading(true); setError(""); try { const [summary, customers, charges, payments, alertResult] = await Promise.all([apiRequest("/collections/summary?period=month"), apiRequest("/customers"), apiRequest("/customer-charges"), apiRequest("/customer-payments"), apiRequest("/collections/alerts")]); setData({ summary, customers: customers.customers ?? [], charges: charges.charges ?? [], payments: payments.payments ?? [] }); setAlerts(alertResult.alerts ?? []); } catch (e) { setError(e.message || "No fue posible cargar cobranza."); } finally { setLoading(false); } }, []);
  useEffect(() => { load(); }, [load]);
  if (loading) return <section className="dashboard-state"><Spinner label="Cargando cobranza" /></section>;
  if (error) return <Alert><div className="dashboard-error"><span>{error}</span><Button variant="secondary" onClick={load}>Reintentar</Button></div></Alert>;
  const summary = data.summary; const today = new Date(); const filteredCharges = data.charges.filter((charge) => { const due = new Date(`${charge.dueDate}T23:59:59`); if (filter === "overdue") return charge.status === "overdue"; if (filter === "upcoming") return charge.status !== "paid" && charge.status !== "cancelled" && due >= today; if (filter === "paid") return charge.status === "paid"; if (filter === "today") return charge.dueDate === today.toISOString().slice(0, 10); if (filter === "week") { const end = new Date(today); end.setDate(end.getDate() + 7); return due >= today && due <= end; } if (filter === "month") return due.getMonth() === today.getMonth() && due.getFullYear() === today.getFullYear(); return true; });
  const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });
  function customerStatus(customer) {
    if (data.charges.some((charge) => charge.customerId === customer.id && charge.status === "overdue")) return "Vencido";
    return Number(customer.balance || 0) > 0 ? "Pendiente" : "Al corriente";
  }
  function registerPayment() { navigate("/app/collections/payments/new"); }
  return <div className="collections-page"><PageHeader title="Cobranza" description="Clientes, cargos y pagos del negocio." actions={data ? <><Link className="button button--primary" to="/app/collections/customers/new">Nuevo cliente</Link>{session.permissions.canManageCustomerCharges && <Link className="button button--secondary" to="/app/collections/charges/new">Nuevo cargo</Link>}<button className="button button--secondary" type="button" onClick={registerPayment}>Registrar pago</button></> : null} />
    <section className="metric-grid" aria-label="Resumen de cobranza"><Card><p className="eyebrow">Clientes activos</p><strong>{summary.activeCustomers}</strong></Card><Card><p className="eyebrow">Cargos pendientes</p><strong>{money.format(summary.totalCharges)}</strong></Card><Card><p className="eyebrow">Total abonado</p><strong>{money.format(summary.totalPaid)}</strong></Card><Card><p className="eyebrow">Cuentas vencidas</p><strong>{summary.overdueAccounts}</strong></Card></section>
    <Card className="collection-alerts"><header className="section-heading"><div><p className="eyebrow">Alertas de cobranza</p><h2>{alerts.length ? `${alerts.length} pago(s) mensual(es) requieren atención` : "No hay alertas pendientes"}</h2></div></header>{alerts.map((alert) => <Link className={`collection-alert collection-alert--${alert.status}`} key={alert.id} to={`/app/collections/customers/${alert.customerId}`}><span><strong>{alert.message}</strong><small>{alert.customerName} · {alert.concept} · límite {alert.dueDate}</small></span><strong>{money.format(alert.remainingBalance)}</strong></Link>)}</Card>
    <section className="collections-grid"><Card><header className="section-heading"><div><p className="eyebrow">Clientes</p><h2>Clientes registrados</h2></div><Link className="button button--primary button--compact collections-view-all-button" to="/app/collections/customers">Ver todos los clientes</Link></header>{data.customers.length ? <ul className="collection-list">{data.customers.slice(0, 8).map((customer) => <li key={customer.id}><Link className="collection-customer" to={`/app/collections/customers/${customer.id}`}><div><strong>{customer.name}</strong><span>{customer.phone || "Sin teléfono"}</span></div><div className="collection-customer__summary"><strong>{money.format(customer.balance)}</strong><span className={`collection-status collection-status--${customerStatus(customer).toLowerCase().replace(" ", "-")}`}>{customerStatus(customer)}</span></div></Link></li>)}</ul> : <EmptyState title="Sin clientes" description="Registra el primer cliente para comenzar." />}</Card><Card><header className="section-heading"><div><p className="eyebrow">Actividad</p><h2>Pagos recientes</h2></div></header>{data.payments.length ? <ul className="collection-list">{data.payments.slice(0, 8).map((payment) => <li key={payment.id}><div><strong>{payment.customerName || "Cliente"}</strong><span>{payment.folio}</span></div><strong>{money.format(payment.amount)}</strong></li>)}</ul> : <EmptyState title="Sin pagos" description="Los abonos registrados aparecerán aquí." />}</Card></section>
    <Card><header className="section-heading"><div><p className="eyebrow">Cargos</p><h2>Cobranza</h2></div><div className="collections-card-actions">{session.permissions.canManageCustomerCharges && <Link className="button button--primary button--compact" to="/app/collections/charges/new">Nuevo cargo</Link>}<Select id="collections-filter" label="Filtrar" value={filter} onChange={(e) => setFilter(e.target.value)}><option value="all">Todos</option><option value="today">Hoy</option><option value="week">Esta semana</option><option value="month">Este mes</option><option value="overdue">Vencidos</option><option value="upcoming">Próximos a vencer</option><option value="paid">Pagados</option></Select></div></header>{filteredCharges.length ? filteredCharges.slice(0, 10).map((charge) => <div className="collection-row" key={charge.id}><span><strong>{charge.concept}</strong><small>Vence {charge.dueDate}</small></span><strong>{money.format(charge.balance)}</strong></div>) : <EmptyState title="Sin cargos" description="No hay cargos para este filtro." action={session.permissions.canManageCustomerCharges ? <Link className="button button--secondary" to="/app/collections/charges/new">Crear primer cargo</Link> : null} />}</Card>
  </div>;
}
