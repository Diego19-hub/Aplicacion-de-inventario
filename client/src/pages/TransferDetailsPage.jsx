import { ArrowLeft, ArrowRight } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { apiRequest } from "../api/client.js";
import { Alert } from "../components/Alert.jsx";
import { Button } from "../components/Button.jsx";
import { Card } from "../components/Card.jsx";
import { EmptyState } from "../components/EmptyState.jsx";
import { PageHeader } from "../components/PageHeader.jsx";
import { Spinner } from "../components/Spinner.jsx";

function formatDate(value) {
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function MovementCard({ title, movement }) {
  return <Card className="transfer-movement-card"><p className="eyebrow">{title}</p><h2>{movement.location.name} ({movement.location.code})</h2><dl className="detail-list"><div><dt>Cambio</dt><dd>{movement.quantityDelta > 0 ? "+" : ""}{movement.quantityDelta} unidades</dd></div><div><dt>Saldo</dt><dd>{movement.previousStock} → {movement.resultingStock}</dd></div><div><dt>Fecha</dt><dd><time dateTime={movement.createdAt}>{formatDate(movement.createdAt)}</time></dd></div></dl></Card>;
}

export function TransferDetailsPage() {
  const { transferId } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setData(await apiRequest(`/transfers/${transferId}`));
    } catch (requestError) {
      setError(requestError);
    } finally {
      setIsLoading(false);
    }
  }, [transferId]);

  useEffect(() => {
    load();
  }, [load]);

  if (isLoading) return <section className="dashboard-state"><Spinner label="Cargando transferencia" /></section>;
  if (error?.code === "TRANSFER_NOT_FOUND" || error?.code === "VALIDATION_ERROR") return <EmptyState title="Transferencia no encontrada" description="La transferencia no está disponible en el negocio activo." action={<Link className="button button--secondary" to="/app/transfers">Volver a transferencias</Link>} />;
  if (error) return <Alert><div className="dashboard-error"><span>No fue posible cargar la transferencia.</span><Button variant="secondary" onClick={load}>Reintentar</Button></div></Alert>;

  const { transfer } = data;
  return <>
    <Link to="/app/transfers" className="back-link"><ArrowLeft aria-hidden="true" />Volver a transferencias</Link>
    <PageHeader title={`Transferencia #${transfer.id}`} description={formatDate(transfer.createdAt)} />
    <section className="transfer-detail-grid"><Card><p className="eyebrow">Producto</p><h2><Link className="text-link" to={`/app/products/${transfer.product.id}`}>{transfer.product.name}</Link></h2><p className="muted">SKU: {transfer.product.sku}</p><dl className="detail-list"><div><dt>Recorrido</dt><dd>{transfer.fromLocation.name} <ArrowRight aria-hidden="true" /> {transfer.toLocation.name}</dd></div><div><dt>Cantidad</dt><dd>{transfer.quantity} unidades</dd></div><div><dt>Usuario</dt><dd>{transfer.createdBy.username}</dd></div><div><dt>Referencia</dt><dd>{transfer.reference || "Sin referencia"}</dd></div></dl><p className="transfer-detail__reason"><strong>Motivo</strong><br />{transfer.reason}</p></Card><section className="transfer-movement-grid"><MovementCard title="Salida" movement={transfer.transferOut} /><MovementCard title="Entrada" movement={transfer.transferIn} /></section></section>
  </>;
}
