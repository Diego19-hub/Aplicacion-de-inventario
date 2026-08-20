import {
  BellRing,
  Boxes,
  CircleDollarSign,
  MapPin,
  Package,
  RefreshCw
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
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

export function DashboardPage() {
  const { session } = useAuth();
  const { activeBusiness, membership, user } = session;
  const [dashboard, setDashboard] = useState(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const loadDashboard = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      setDashboard(await apiRequest("/dashboard"));
    } catch (requestError) {
      setError(requestError.message || "No fue posible cargar el dashboard.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  return (
    <>
      <PageHeader
        title={`Hola, ${user.username}`}
        description={`${activeBusiness.name} · Rol ${membership.role}`}
        actions={<Link to="/select-business" className="button button--secondary">Cambiar negocio</Link>}
      />
      {isLoading && <section className="dashboard-state"><Spinner label="Cargando resumen del negocio" /></section>}
      {!isLoading && error && <Alert><div className="dashboard-error"><span>{error}</span><Button variant="secondary" onClick={loadDashboard}><RefreshCw aria-hidden="true" />Reintentar</Button></div></Alert>}
      {!isLoading && dashboard && <>
        <section className="metric-grid" aria-label="Resumen del inventario">
          {metricCards(dashboard.summary, activeBusiness.currency).map(({ label, value, icon: Icon }) => <Card key={label} className="metric-card"><Icon aria-hidden="true" className="card-icon" /><p>{label}</p><strong>{value}</strong></Card>)}
        </section>
        <section className="dashboard-sections">
          <Card className="dashboard-card--wide"><header className="section-heading"><div><p className="eyebrow">Últimos 30 días</p><h2>Entradas contra salidas</h2></div></header>{(dashboard.movementTrend ?? []).length === 0 ? <EmptyState title="Sin actividad en este periodo" description="Los movimientos aparecerán aquí cuando se registren." /> : <MovementTrendChart data={dashboard.movementTrend ?? []} />}</Card>
          <Card><header className="section-heading"><div><p className="eyebrow">Distribución</p><h2>Stock por categoría</h2></div></header>{dashboard.stockByCategory.length === 0 ? <EmptyState title="Sin categorías con stock" description="El stock por categoría aparecerá aquí." /> : <ul className="category-stock-list">{dashboard.stockByCategory.map((category) => <li key={category.id}><div><strong>{category.name}</strong><span>{category.totalStock} unidades</span></div><div className="category-stock-bar"><span style={{ width: `${Math.min(100, (category.totalStock / Math.max(dashboard.summary.totalUnits, 1)) * 100)}%` }} /></div></li>)}</ul>}</Card>
          <Card><header className="section-heading"><div><p className="eyebrow">Atención</p><h2>Productos con stock bajo</h2></div></header>{dashboard.lowStockProducts.length === 0 ? <EmptyState title="Sin productos en riesgo" description="No hay productos por debajo de su umbral configurado." /> : <ul className="low-stock-list">{dashboard.lowStockProducts.map((product) => <li key={product.id}><div><strong>{product.name}</strong><span>{product.sku} · {product.categoryName}</span></div><strong className="stock-status stock-status--low_stock">{product.totalStock} / {product.minimumStock}</strong></li>)}</ul>}</Card>
          <Card>
            <header className="section-heading"><div><p className="eyebrow">Actividad</p><h2>Movimientos recientes</h2></div></header>
            {dashboard.recentMovements.length === 0 ? <EmptyState title="Aún no hay movimientos" description="Los movimientos registrados aparecerán aquí." /> : <div className="movement-list">{dashboard.recentMovements.map((movement) => <article className="movement-row" key={movement.id}><div><strong>{movement.itemName}</strong><span>{movement.sku} · {movement.locationName} ({movement.locationCode})</span></div><div><strong className={movement.quantityDelta >= 0 ? "delta delta--positive" : "delta delta--negative"}>{movement.quantityDelta >= 0 ? "+" : ""}{movement.quantityDelta}</strong><span>{movementLabels[movement.movementType] ?? movement.movementType}</span></div><div><span>{movement.username}</span><time dateTime={movement.createdAt}>{formatDate(movement.createdAt)}</time></div></article>)}</div>}
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
