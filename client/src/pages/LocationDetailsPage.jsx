import { ArrowLeft } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { apiRequest } from "../api/client.js";
import { Alert } from "../components/Alert.jsx";
import { Button } from "../components/Button.jsx";
import { Card } from "../components/Card.jsx";
import { EmptyState } from "../components/EmptyState.jsx";
import { PageHeader } from "../components/PageHeader.jsx";
import { Spinner } from "../components/Spinner.jsx";
import { useAuth } from "../context/AuthContext.jsx";

function formatDate(value) {
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function typeLabel(type) {
  return type === "warehouse" ? "Bodega" : "Sucursal";
}

function movementLabel(type) {
  const labels = { opening_balance: "Saldo inicial", entry: "Entrada", exit: "Salida", adjustment: "Ajuste", transfer_out: "Transferencia — salida", transfer_in: "Transferencia — entrada" };
  return labels[type] ?? type;
}

export function LocationDetailsPage() {
  const { locationId } = useParams();
  const { session } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadLocation = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setData(await apiRequest(`/locations/${locationId}`));
    } catch (requestError) {
      setError(requestError);
    } finally {
      setIsLoading(false);
    }
  }, [locationId]);

  useEffect(() => {
    loadLocation();
  }, [loadLocation]);

  if (isLoading) return <section className="dashboard-state"><Spinner label="Cargando ubicación" /></section>;
  if (error?.code === "LOCATION_NOT_FOUND" || error?.code === "VALIDATION_ERROR") return <EmptyState title="Ubicación no encontrada" description="La ubicación no está disponible en el negocio activo." action={<Link className="button button--secondary" to="/app/locations">Volver a ubicaciones</Link>} />;
  if (error) return <Alert><div className="dashboard-error"><span>No fue posible cargar la ubicación.</span><Button variant="secondary" onClick={loadLocation}>Reintentar</Button></div></Alert>;

  const { location, products, recentMovements } = data;
  return <>
    <Link to="/app/locations" className="back-link"><ArrowLeft aria-hidden="true" />Volver a ubicaciones</Link>
    <PageHeader title={location.name} description={`Código: ${location.code}`} actions={session.permissions.canDeleteInventory ? <Link className="button button--primary" to={`/app/locations/${location.id}/edit`}>Editar ubicación</Link> : null} />
    <section className="transfer-detail-grid">
      <Card><p className="eyebrow">Información de la ubicación</p><dl className="detail-list"><div><dt>Tipo</dt><dd>{typeLabel(location.type)}</dd></div><div><dt>Estado</dt><dd>{location.status === "active" ? "Activa" : "Inactiva"}</dd></div><div><dt>Principal</dt><dd>{location.isDefault ? "Sí, ubicación principal" : "No"}</dd></div><div><dt>Dirección</dt><dd>{location.address || "Sin dirección registrada"}</dd></div><div><dt>Teléfono</dt><dd>{location.phone || "Sin teléfono registrado"}</dd></div>{location.notes && <div><dt>Notas</dt><dd>{location.notes}</dd></div>}</dl></Card>
      <Card><p className="eyebrow">Existencias</p><dl className="detail-list"><div><dt>Stock almacenado</dt><dd>{location.totalStock} unidades</dd></div><div><dt>Productos con stock</dt><dd>{location.positiveProductCount}</dd></div></dl></Card>
    </section>
    <section className="category-products"><header className="section-heading"><div><p className="eyebrow">Productos con stock</p><h2>Existencias por producto</h2></div></header>{products.length === 0 ? <EmptyState title="Sin productos con stock" description="No hay existencias positivas en esta ubicación." /> : <section className="product-grid" aria-label="Productos con stock en la ubicación">{products.map((product) => <Card key={product.id} className="product-card"><div className="product-card__heading"><span className="sku-badge">{product.sku}</span><span>{product.status === "active" ? "Activo" : "Archivado"}</span></div><h3><Link className="text-link" to={`/app/products/${product.id}`}>{product.name}</Link></h3><dl><div><dt>Stock local</dt><dd>{product.localStock} unidades</dd></div><div><dt>Stock total</dt><dd>{product.totalStock} unidades</dd></div></dl></Card>)}</section>}</section>
    <section className="category-products"><header className="section-heading"><div><p className="eyebrow">Actividad reciente</p><h2>Últimos movimientos</h2></div></header>{recentMovements.length === 0 ? <EmptyState title="Sin movimientos recientes" description="Los movimientos de esta ubicación aparecerán aquí." /> : <section className="transfer-list" aria-label="Movimientos recientes de la ubicación">{recentMovements.map((movement) => <Card key={movement.id} className="transfer-card"><div className="transfer-card__header"><div><Link className="transfer-card__product" to={`/app/products/${movement.product.id}`}>{movement.product.name}</Link><span>{movement.product.sku}</span></div><strong>{movement.quantityDelta > 0 ? "+" : ""}{movement.quantityDelta} unidades</strong></div><div className="transfer-card__meta"><span>{movementLabel(movement.type)}</span><span>{movement.createdBy.username}</span><time dateTime={movement.createdAt}>{formatDate(movement.createdAt)}</time>{movement.transferId !== null && <Link className="text-link" to={`/app/transfers/${movement.transferId}`}>Transferencia #{movement.transferId}</Link>}</div></Card>)}</section>}</section>
  </>;
}
