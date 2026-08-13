import { ArrowLeft, MapPin, PackageOpen } from "lucide-react";
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

const movementLabels = { opening_balance: "Saldo inicial", entry: "Entrada", exit: "Salida", adjustment: "Ajuste", transfer_out: "Transferencia — salida", transfer_in: "Transferencia — entrada" };
const alertLabels = { not_configured: "Sin umbral configurado", out_of_stock: "Agotado", low_stock: "Stock bajo", ok: "Stock suficiente" };

function formatDate(value) {
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function ProductDetailsPage() {
  const { productId } = useParams();
  const { session } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadProduct = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setData(await apiRequest(`/products/${productId}`));
    } catch (requestError) {
      setError(requestError);
    } finally {
      setIsLoading(false);
    }
  }, [productId]);

  useEffect(() => { loadProduct(); }, [loadProduct]);

  if (isLoading) return <section className="dashboard-state"><Spinner label="Cargando producto" /></section>;
  if (error?.code === "PRODUCT_NOT_FOUND") return <EmptyState title="Producto no encontrado" description="El producto no está disponible en el negocio activo." action={<Link className="button button--secondary" to="/app/products"><ArrowLeft aria-hidden="true" />Volver a productos</Link>} />;
  if (error) return <Alert><div className="dashboard-error"><span>No fue posible cargar el producto.</span><Button variant="secondary" onClick={loadProduct}>Reintentar</Button></div></Alert>;

  const { product, balances, recentMovements } = data;
  const currency = session.activeBusiness.currency;

  return <>
    <Link to="/app/products" className="back-link"><ArrowLeft aria-hidden="true" />Volver a productos</Link>
    <PageHeader
      title={product.name}
      description={`SKU: ${product.sku}`}
      actions={<>{session.permissions.canManageInventory && <><Link className="button button--primary" to={`/app/products/${product.id}/edit`}>Editar producto</Link><Link className="button button--secondary" to={`/app/products/${product.id}/movements/new`}>Registrar movimiento</Link><Link className="button button--secondary" to={`/app/transfers/new?product=${product.id}`}>Transferir</Link><Link className="button button--secondary" to={`/app/products/${product.id}/thresholds`}>Configurar alertas</Link></>}{session.permissions.canDeleteInventory && <Link className="button button--danger" to={`/app/products/${product.id}/archive`}>Archivar producto</Link>}</>}
    />
    <section className="product-detail-grid">
      <Card><p className="eyebrow">Información del producto</p><p className="product-description">{product.description || "Este producto no tiene una descripción registrada."}</p><dl className="detail-list"><div><dt>Categoría</dt><dd>{product.category.name}</dd></div><div><dt>Marca</dt><dd>{product.brand}</dd></div><div><dt>Precio</dt><dd>{new Intl.NumberFormat("es-MX", { style: "currency", currency }).format(product.price)}</dd></div><div><dt>Existencias totales</dt><dd>{product.stock} unidades</dd></div><div><dt>Creado</dt><dd><time dateTime={product.createdAt}>{formatDate(product.createdAt)}</time></dd></div></dl></Card>
      <Card><p className="eyebrow">Existencias por ubicación</p>{balances.length === 0 ? <EmptyState title="Sin ubicaciones disponibles" description="No hay ubicaciones que mostrar para este producto." /> : <ul className="balance-list">{balances.map((balance) => <li key={balance.location.id}><div><strong><MapPin aria-hidden="true" />{balance.location.name}</strong><span>{balance.location.code}{balance.location.isDefault ? " · Principal" : ""}{balance.location.status === "inactive" ? " · Inactiva" : ""}</span></div><div><strong>{balance.stock} unidades</strong><span className={`stock-status stock-status--${balance.alertStatus}`}>{alertLabels[balance.alertStatus]}</span>{balance.minimumStock !== null && <small>Mínimo: {balance.minimumStock}</small>}</div></li>)}</ul>}</Card>
    </section>
    <Card className="detail-movements"><header className="section-heading"><div><p className="eyebrow">Actividad</p><h2>Movimientos recientes</h2></div><Link className="text-link" to={`/app/products/${product.id}/movements`}>Ver todos los movimientos</Link></header>{recentMovements.length === 0 ? <EmptyState title="Sin movimientos recientes" description="Los movimientos de este producto aparecerán aquí." /> : <div className="movement-list">{recentMovements.map((movement) => <article className="movement-row" key={movement.id}><div><strong>{movementLabels[movement.type] ?? movement.type}</strong><span>{movement.location.name} ({movement.location.code})</span></div><div><strong className={movement.quantityDelta >= 0 ? "delta delta--positive" : "delta delta--negative"}>{movement.quantityDelta >= 0 ? "+" : ""}{movement.quantityDelta}</strong><span>{movement.previousStock} → {movement.resultingStock}</span></div><div><span>{movement.createdBy.username}</span><time dateTime={movement.createdAt}>{formatDate(movement.createdAt)}</time>{movement.transferId !== null && <Link className="text-link" to={`/app/transfers/${movement.transferId}`}>Transferencia #{movement.transferId}</Link>}</div><p className="movement-reason">{movement.reason}</p></article>)}</div>}</Card>
  </>;
}
