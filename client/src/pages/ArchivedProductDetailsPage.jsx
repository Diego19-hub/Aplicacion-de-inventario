import { ArrowLeft, MapPin } from "lucide-react";
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

function formatDate(value) { return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
const movementLabels = { opening_balance: "Saldo inicial", entry: "Entrada", exit: "Salida", adjustment: "Ajuste", transfer_out: "Transferencia — salida", transfer_in: "Transferencia — entrada" };

export function ArchivedProductDetailsPage() {
  const { productId } = useParams();
  const { session } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => { setLoading(true); setError(null); try { setData(await apiRequest(`/products/${productId}/archived`)); } catch (requestError) { setError(requestError); } finally { setLoading(false); } }, [productId]);
  useEffect(() => { if (session.permissions.canDeleteInventory) load(); else setLoading(false); }, [load, session.permissions.canDeleteInventory]);
  if (!session.permissions.canDeleteInventory) return <EmptyState title="Acceso restringido" description="Solo la persona propietaria puede consultar productos archivados." action={<Link className="button button--secondary" to="/app/products">Volver a productos</Link>} />;
  if (loading) return <section className="dashboard-state"><Spinner label="Cargando producto archivado" /></section>;
  if (error?.code === "PRODUCT_NOT_FOUND") return <EmptyState title="Producto no encontrado" description="El producto archivado no está disponible en el negocio activo." action={<Link className="button button--secondary" to="/app/products/archived">Volver a archivados</Link>} />;
  if (error) return <Alert><div className="dashboard-error"><span>No fue posible cargar el producto.</span><Button variant="secondary" onClick={load}>Reintentar</Button></div></Alert>;
  const { product, balances, recentMovements } = data;
  return <>
    <Link to="/app/products/archived" className="back-link"><ArrowLeft aria-hidden="true" />Productos archivados</Link>
    <PageHeader title={product.name} description={`SKU: ${product.sku} · Archivado`} actions={<Link className="button button--primary" to={`/app/products/${product.id}/restore`}>Restaurar producto</Link>} />
    <section className="product-detail-grid"><Card><p className="eyebrow">Producto archivado</p><p className="product-description">{product.description || "Este producto no tiene una descripción registrada."}</p><dl className="detail-list"><div><dt>Categoría</dt><dd>{product.category.name}</dd></div><div><dt>Marca</dt><dd>{product.brand}</dd></div><div><dt>Existencias totales</dt><dd>{product.stock} unidades</dd></div><div><dt>Archivado</dt><dd><time dateTime={product.archivedAt}>{formatDate(product.archivedAt)}</time></dd></div><div><dt>Motivo</dt><dd>{product.archiveReason}</dd></div>{product.archivedByUsername && <div><dt>Archivado por</dt><dd>{product.archivedByUsername}</dd></div>}</dl></Card><Card><p className="eyebrow">Existencias por ubicación</p>{balances.length === 0 ? <EmptyState title="Sin ubicaciones disponibles" description="No hay ubicaciones que mostrar para este producto." /> : <ul className="balance-list">{balances.map((balance) => <li key={balance.location.id}><div><strong><MapPin aria-hidden="true" />{balance.location.name}</strong><span>{balance.location.code}{balance.location.isDefault ? " · Principal" : ""}</span></div><strong>{balance.stock} unidades</strong></li>)}</ul>}</Card></section>
    <Card className="detail-movements"><header className="section-heading"><div><p className="eyebrow">Actividad conservada</p><h2>Movimientos recientes</h2></div></header>{recentMovements.length === 0 ? <EmptyState title="Sin movimientos recientes" description="No hay movimientos para este producto." /> : <div className="movement-list">{recentMovements.map((movement) => <article className="movement-row" key={movement.id}><div><strong>{movementLabels[movement.type] ?? movement.type}</strong><span>{movement.location.name} ({movement.location.code})</span></div><div><strong>{movement.quantityDelta >= 0 ? "+" : ""}{movement.quantityDelta}</strong><span>{movement.previousStock} → {movement.resultingStock}</span></div><div><span>{movement.createdBy.username}</span><time dateTime={movement.createdAt}>{formatDate(movement.createdAt)}</time></div><p className="movement-reason">{movement.reason}</p></article>)}</div>}</Card>
  </>;
}
