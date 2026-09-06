import { Alert } from "./Alert.jsx";
import { Button } from "./Button.jsx";
import { Card } from "./Card.jsx";
import { EmptyState } from "./EmptyState.jsx";
import { Spinner } from "./Spinner.jsx";

const layerStatusLabels = { available: "Disponible", partial: "Parcial", depleted: "Agotada" };
const sourceOperationLabels = {
  opening_balance: "Saldo inicial",
  purchase_receipt: "Recepción de compra",
  manual_entry: "Entrada manual",
  adjustment_in: "Ajuste positivo",
  customer_return: "Devolución de cliente",
  production_output: "Producción",
  transfer_in: "Transferencia",
  migration: "Migración"
};
const consumptionOperationLabels = {
  sale: "Venta",
  manual_exit: "Salida manual",
  damage_loss: "Daño o pérdida",
  supplier_return: "Devolución a proveedor",
  production_consumption: "Producción",
  adjustment_out: "Ajuste negativo",
  transfer_out: "Transferencia",
  other: "Otro"
};

function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function formatCost(value, currency) {
  if (value === null || value === undefined || value === "") return "—";
  return `${value} ${currency}`;
}

function LayerDetails({ layer, currency }) {
  return <Card className="cost-layer-card">
    <div className="cost-layer-card__heading">
      <div><p className="eyebrow">Capa #{layer.id}</p><h3>{layerStatusLabels[layer.status] ?? layer.status}</h3></div>
      <span className={`cost-layer-status cost-layer-status--${layer.status}`}>{layerStatusLabels[layer.status] ?? layer.status}</span>
    </div>
    <dl className="cost-layer-details">
      <div><dt>Fecha de entrada</dt><dd>{formatDate(layer.receivedAt)}</dd></div>
      <div><dt>Ubicación</dt><dd>{layer.location.name} ({layer.location.code})</dd></div>
      <div><dt>Cantidad original</dt><dd>{layer.quantityOriginal}</dd></div>
      <div><dt>Cantidad disponible</dt><dd>{layer.quantityAvailable}</dd></div>
      <div><dt>Cantidad consumida</dt><dd>{layer.quantityConsumed}</dd></div>
      <div><dt>Costo unitario</dt><dd>{formatCost(layer.unitCost, currency)}</dd></div>
      <div><dt>Costo total disponible</dt><dd>{formatCost(layer.availableValue, currency)}</dd></div>
      <div><dt>Referencia</dt><dd>{layer.reference || "—"}</dd></div>
      <div><dt>Operación de origen</dt><dd>{sourceOperationLabels[layer.sourceOperationType] ?? layer.sourceOperationType}</dd></div>
      <div><dt>Método de valuación</dt><dd>PEPS/FIFO</dd></div>
    </dl>
  </Card>;
}

function ConsumptionDetails({ consumption, currency }) {
  return <Card className="cost-consumption-card">
    <div className="cost-consumption-card__heading"><strong>{consumptionOperationLabels[consumption.operationType] ?? consumption.operationType}</strong><span>{formatDate(consumption.consumedAt)}</span></div>
    <dl className="cost-layer-details">
      <div><dt>Capa</dt><dd>#{consumption.layerId}</dd></div>
      <div><dt>Cantidad consumida</dt><dd>{consumption.quantity}</dd></div>
      <div><dt>Costo unitario</dt><dd>{formatCost(consumption.unitCost, currency)}</dd></div>
      <div><dt>Costo total</dt><dd>{formatCost(consumption.totalCost, currency)}</dd></div>
      <div><dt>Referencia relacionada</dt><dd>{consumption.reference || "—"}</dd></div>
      <div><dt>Ubicación</dt><dd>{consumption.location.name} ({consumption.location.code})</dd></div>
    </dl>
  </Card>;
}

export function ProductCostLayersSection({ data, error, isLoading, onRetry, currency }) {
  if (isLoading) return <Card className="product-cost-layers"><Spinner label="Cargando capas FIFO y trazabilidad" /></Card>;
  if (error) return <Card className="product-cost-layers"><Alert><div className="dashboard-error"><span>No fue posible cargar las capas FIFO y la trazabilidad.</span><Button variant="secondary" onClick={onRetry}>Reintentar</Button></div></Alert></Card>;
  if (!data) return null;

  if (data.valuationMethod === "average") {
    return <Card className="product-cost-layers"><p className="eyebrow">Valuación del inventario</p><p className="cost-layers-average-message">Este negocio utiliza valuación promedio; no se muestran capas FIFO.</p></Card>;
  }

  return <section className="product-cost-layers" aria-labelledby="cost-layers-title">
    <header className="section-heading"><div><p className="eyebrow">Trazabilidad del inventario</p><h2 id="cost-layers-title">Capas FIFO y trazabilidad</h2></div><span className="cost-layers-method">Método de valuación: <strong>PEPS/FIFO</strong></span></header>
    {data.layers.length === 0 ? <EmptyState title="Este producto todavía no tiene capas FIFO registradas." description="Las capas aparecerán cuando se registre una entrada, recepción o producción." /> : <div className="cost-layer-grid">{data.layers.map((layer) => <LayerDetails key={layer.id} layer={layer} currency={currency} />)}</div>}
    <div className="cost-consumptions"><div className="section-heading"><div><p className="eyebrow">Historial</p><h3>Consumos y trazabilidad</h3></div></div>{data.consumptions.length === 0 ? <p className="muted">No hay consumos registrados para este producto.</p> : <div className="cost-consumption-grid">{data.consumptions.map((consumption) => <ConsumptionDetails key={consumption.id} consumption={consumption} currency={currency} />)}</div>}</div>
  </section>;
}
