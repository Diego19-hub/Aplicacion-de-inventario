import { ArrowLeft, Printer, ReceiptText } from "lucide-react";
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

const PAYMENT_LABELS = { cash: "Efectivo", card: "Tarjeta", transfer: "Transferencia" };
const STATUS_LABELS = { completed: "Completada", cancelled: "Cancelada" };
const MOVEMENT_LABELS = { opening_balance: "Saldo inicial", entry: "Entrada", exit: "Salida", adjustment: "Ajuste", transfer_in: "Transferencia entrante", transfer_out: "Transferencia saliente" };
const dateFormatter = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" });

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Fecha no disponible" : dateFormatter.format(date);
}

export function SaleDetailsPage() {
  const { saleId } = useParams();
  const { session } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const currency = session.activeBusiness?.currency || "MXN";
  const moneyFormatter = new Intl.NumberFormat("es-MX", { style: "currency", currency });

  const loadSale = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setData(await apiRequest(`/sales/${encodeURIComponent(saleId)}`));
    } catch (requestError) {
      setError(requestError);
    } finally {
      setIsLoading(false);
    }
  }, [saleId]);

  useEffect(() => { loadSale(); }, [loadSale]);

  if (isLoading) return <section className="dashboard-state"><Spinner label="Cargando venta" /></section>;
  if (error?.code === "SALE_NOT_FOUND" || error?.code === "VALIDATION_ERROR") {
    return <EmptyState title="Venta no encontrada" description="La venta no está disponible en el negocio activo." action={<Link className="button button--secondary" to="/app/sales"><ArrowLeft aria-hidden="true" />Volver a ventas</Link>} />;
  }
  if (error) return <Alert><div className="dashboard-error"><span>{error.message || "No fue posible cargar la venta."}</span><Button variant="secondary" onClick={loadSale}>Reintentar</Button></div></Alert>;

  const { sale, items = [], movements = [] } = data;
  const isCash = sale.paymentMethod === "cash";

  return <div className="sale-detail-page">
    <nav className="sale-breadcrumb" aria-label="Migas de pan"><Link to="/app/sales">Ventas</Link><span aria-hidden="true">/</span><span>Venta #{sale.id}</span></nav>
    <PageHeader
      title={`Detalle de la venta #${sale.id}`}
      description={formatDate(sale.createdAt)}
      actions={<><Link className="button button--secondary" to="/app/sales"><ArrowLeft aria-hidden="true" />Volver a ventas</Link><Button className="sale-print-button" variant="primary" onClick={() => window.print()}><Printer aria-hidden="true" />Imprimir ticket</Button></>}
    />

    <div className="sale-ticket">
      <header className="sale-ticket__header"><strong>Inventario</strong><span>Venta #{sale.id}</span><time dateTime={sale.createdAt}>{formatDate(sale.createdAt)}</time></header>
      <section className="sale-details-grid">
      <Card className="sale-summary-card">
        <div className="sale-detail-heading"><ReceiptText aria-hidden="true" /><div><p className="eyebrow">Información general</p><h2>Resumen de la venta</h2></div></div>
        <dl className="detail-list">
          <div><dt>Usuario</dt><dd>{sale.username || "—"}</dd></div>
          <div><dt>Ubicación</dt><dd>{sale.location?.name || "—"}{sale.location?.code ? ` (${sale.location.code})` : ""}</dd></div>
          <div><dt>Método de pago</dt><dd>{PAYMENT_LABELS[sale.paymentMethod] || sale.paymentMethod}</dd></div>
          <div><dt>Estado</dt><dd><span className={`sales-status sales-status--${sale.status}`}>{STATUS_LABELS[sale.status] || sale.status}</span></dd></div>
          <div><dt>Subtotal</dt><dd>{moneyFormatter.format(Number(sale.subtotal) || 0)}</dd></div>
          <div><dt>Total</dt><dd className="sale-summary-total">{moneyFormatter.format(Number(sale.total) || 0)}</dd></div>
          {isCash && <><div><dt>Efectivo recibido</dt><dd>{moneyFormatter.format(Number(sale.amountReceived) || 0)}</dd></div><div><dt>Cambio</dt><dd>{moneyFormatter.format(Number(sale.changeAmount) || 0)}</dd></div></>}
        </dl>
      </Card>

      <Card className="sale-items-card">
        <div className="section-heading"><div><p className="eyebrow">Detalle</p><h2>Productos vendidos</h2></div><span className="muted">{items.length} producto(s)</span></div>
        {items.length === 0 ? <EmptyState title="Sin productos" description="Esta venta no tiene productos registrados." /> : <div className="sale-table-wrap"><table className="sale-table"><caption className="visually-hidden">Productos de la venta #{sale.id}</caption><thead><tr><th>Producto</th><th className="sale-table__optional">SKU</th><th className="sale-table__optional">Código de barras</th><th>Cantidad</th><th>Precio unitario</th><th>Total</th></tr></thead><tbody>{items.map((item) => <tr key={item.itemId}><th scope="row">{item.name}</th><td className="sale-table__optional">{item.sku}</td><td className="sale-table__optional">{item.barcode || "—"}</td><td>{item.quantity}</td><td>{moneyFormatter.format(Number(item.unitPrice) || 0)}</td><td className="sale-table__total">{moneyFormatter.format(Number(item.lineTotal) || 0)}</td></tr>)}</tbody></table></div>}
      </Card>
      </section>
    </div>

    <Card className="sale-movements-card">
      <div className="section-heading"><div><p className="eyebrow">Inventario</p><h2>Movimientos relacionados</h2></div><span className="muted">{movements.length} movimiento(s)</span></div>
      {movements.length === 0 ? <EmptyState title="Sin movimientos relacionados" description="No hay movimientos de inventario vinculados a esta venta." /> : <div className="sale-table-wrap"><table className="sale-table"><caption className="visually-hidden">Movimientos de inventario de la venta #{sale.id}</caption><thead><tr><th>Tipo</th><th>Cantidad</th><th>Ubicación</th><th>Referencia</th><th>Fecha</th></tr></thead><tbody>{movements.map((movement) => <tr key={movement.id}><th scope="row">{MOVEMENT_LABELS[movement.movementType] || movement.movementType}</th><td className="sale-movement-delta">{Number(movement.quantityDelta) > 0 ? "+" : ""}{movement.quantityDelta}</td><td>{movement.location?.name || "—"}{movement.location?.code ? ` (${movement.location.code})` : ""}</td><td>{movement.reference || "—"}</td><td><time dateTime={movement.createdAt}>{formatDate(movement.createdAt)}</time></td></tr>)}</tbody></table></div>}
    </Card>
  </div>;
}
