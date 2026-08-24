import { AlertTriangle, ArrowLeft, CheckCircle2, RefreshCw, Scale, TrendingUp } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { apiRequest } from "../api/client.js";
import { Alert } from "../components/Alert.jsx";
import { Button } from "../components/Button.jsx";
import { Card } from "../components/Card.jsx";
import { EmptyState } from "../components/EmptyState.jsx";
import { PageHeader } from "../components/PageHeader.jsx";
import { Spinner } from "../components/Spinner.jsx";
import { useAuth } from "../context/AuthContext.jsx";

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function money(value, currency) {
  if (value === null || value === undefined) return "No disponible";
  return new Intl.NumberFormat("es-MX", { style: "currency", currency }).format(Number(value));
}

function number(value) {
  if (value === null || value === undefined) return "No disponible";
  return new Intl.NumberFormat("es-MX", { maximumFractionDigits: 2 }).format(Number(value));
}

function monthLabel(value) {
  if (!value) return "No disponible";
  const [year, month] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric" }).format(new Date(year, month - 1, 1));
}

function statusFor(result) {
  if (result.breakEvenRevenue === null || result.breakEvenRevenue === undefined) return { label: "No disponible", tone: "unknown" };
  if (Number(result.revenue) >= Number(result.breakEvenRevenue)) return { label: Number(result.revenue) > Number(result.breakEvenRevenue) ? "Superado" : "Alcanzado", tone: "success" };
  return { label: "No alcanzado", tone: "warning" };
}

export function BreakEvenPage() {
  const { session } = useAuth();
  const currency = session.activeBusiness?.currency ?? "MXN";
  const [month, setMonth] = useState(currentMonth);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isExplanationOpen, setIsExplanationOpen] = useState(false);

  const loadBreakEven = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setResult(await apiRequest(`/break-even?month=${encodeURIComponent(month)}`));
    } catch (requestError) {
      setError(requestError);
    } finally {
      setIsLoading(false);
    }
  }, [month]);

  useEffect(() => { loadBreakEven(); }, [loadBreakEven]);

  const status = useMemo(() => result ? statusFor(result) : null, [result]);
  const progress = result?.breakEvenRevenue > 0 ? Math.min(100, Math.max(0, (Number(result.revenue) / Number(result.breakEvenRevenue)) * 100)) : 0;
  const fixedCosts = result?.fixedCostsUsed ?? [];
  const monthlyCosts = fixedCosts.filter((cost) => cost.frequency === "monthly");
  const yearlyCosts = fixedCosts.filter((cost) => cost.frequency === "yearly");
  const oneTimeCosts = fixedCosts.filter((cost) => cost.frequency === "one_time");

  if (isLoading && !result) return <section className="dashboard-state"><Spinner label="Calculando punto de equilibrio" /></section>;
  if (error && !result) return <Alert><div className="dashboard-error"><span>{error.status === 404 ? "No se encontró el cálculo solicitado." : error.message || "No fue posible calcular el punto de equilibrio."}{error.code === "INTERNAL_ERROR" && " Verifica que la migración del módulo esté aplicada."}</span><Button variant="secondary" onClick={loadBreakEven}><RefreshCw aria-hidden="true" />Reintentar</Button></div></Alert>;

  return <section className="break-even-page">
    <PageHeader title="Punto de equilibrio" description="Compara tus ventas del mes con el nivel necesario para cubrir los costos fijos." actions={<div className="break-even-period"><label htmlFor="break-even-month">Mes</label><input id="break-even-month" className="field__control" type="month" value={month} onChange={(event) => setMonth(event.target.value)} /><Button variant="secondary" onClick={loadBreakEven} disabled={isLoading}><RefreshCw aria-hidden="true" />{isLoading ? "Actualizando…" : "Actualizar"}</Button></div>} />
    {error && <Alert>{error.message || "No fue posible actualizar los datos."}</Alert>}
    <div className="break-even-period-label"><Scale aria-hidden="true" /><span>Periodo analizado: <strong>{monthLabel(result.period)}</strong></span></div>
    <Card className="break-even-help-card"><div className="break-even-help-heading"><div><p className="eyebrow">Información</p><h2>¿Cómo se calcula el punto de equilibrio?</h2></div><Button variant="secondary" aria-expanded={isExplanationOpen} aria-controls="break-even-explanation" onClick={() => setIsExplanationOpen((open) => !open)}>{isExplanationOpen ? "Ocultar explicación" : "Ver explicación"}</Button></div>{isExplanationOpen && <div id="break-even-explanation" className="break-even-explanation"><p><strong>Costos fijos:</strong> gastos que deben pagarse aunque no haya ventas, como renta, servicios o sueldos.</p><p><strong>Costos variables:</strong> el costo de adquisición de los productos vendidos.</p><p><strong>Utilidad bruta:</strong> ingresos por ventas menos costos variables.</p><p><strong>Margen de contribución:</strong> lo que deja cada venta después de descontar el costo del producto.</p><p><strong>Punto de equilibrio:</strong> el dinero o las unidades que deben venderse para cubrir los costos fijos sin perder ni ganar.</p><div className="break-even-formulas"><p><strong>Punto de equilibrio en unidades</strong> = Costos fijos / Margen de contribución por unidad</p><p><strong>Punto de equilibrio en dinero</strong> = Costos fijos / Porcentaje de margen de contribución</p></div></div>}</Card>
    {result.warnings?.length > 0 && <Alert><div className="break-even-warnings"><strong><AlertTriangle aria-hidden="true" />Advertencias del cálculo</strong><ul>{result.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul><div className="break-even-warning-context">{result.missingCostLines > 0 && <p><strong>Faltan costos de productos:</strong> la utilidad y el punto de equilibrio pueden ser inexactos porque hay ventas sin costo registrado.</p>}{result.contributionMarginUnit !== null && result.contributionMarginUnit <= 0 && <p><strong>Margen cero o negativo:</strong> el precio de venta no cubre el costo del producto y no se puede calcular un punto de equilibrio válido.</p>}{result.salesCount === 0 && <p><strong>Sin ventas:</strong> se necesitan ventas completadas para calcular el margen real del periodo.</p>}{result.calculationComplete === false && <p><strong>Datos incompletos:</strong> revisa y completa los costos de adquisición de tus productos.</p>}</div></div></Alert>}
    <section className="break-even-summary-grid" aria-label="Resumen financiero">
      <Card><span>Costos fijos</span><small className="break-even-help-text">Gastos que existen aunque no vendas.</small><strong>{money(result.fixedCosts, currency)}</strong></Card>
      <Card><span>Ingresos</span><strong>{money(result.revenue, currency)}</strong></Card>
      <Card><span>Unidades vendidas</span><strong>{number(result.unitsSold)}</strong></Card>
      <Card><span>Costos variables</span><small className="break-even-help-text">Costo de adquisición de lo vendido.</small><strong>{money(result.variableCosts, currency)}</strong></Card>
      <Card><span>Utilidad bruta estimada</span><small className="break-even-help-text">Ingresos menos costos variables.</small><strong>{money(result.grossProfit, currency)}</strong></Card>
      <Card><span>Margen de contribución</span><small className="break-even-help-text">Lo que deja cada venta para cubrir costos fijos.</small><strong>{result.contributionMarginRate === null ? "No disponible" : `${number(result.contributionMarginRate * 100)}%`}</strong><small>{result.contributionMarginUnit === null ? "Sin margen unitario" : `${money(result.contributionMarginUnit, currency)} por unidad`}</small></Card>
    </section>
    <Card className="break-even-result-card"><div className="break-even-result-heading"><div><p className="eyebrow">Resultado principal</p><h2>Meta de equilibrio</h2></div>{status && <span className={`break-even-status break-even-status--${status.tone}`}>{status.tone === "success" ? <CheckCircle2 aria-hidden="true" /> : <TrendingUp aria-hidden="true" />}{status.label}</span>}</div><div className="break-even-result-grid"><div><span>Punto de equilibrio en unidades</span><small className="break-even-help-text">Unidades para cubrir costos fijos.</small><strong>{number(result.breakEvenUnits)}</strong></div><div><span>Punto de equilibrio en dinero</span><small className="break-even-help-text">Ventas necesarias para quedar en cero.</small><strong>{money(result.breakEvenRevenue, currency)}</strong></div><div><span>Unidades restantes</span><strong>{number(result.unitsRemaining)}</strong></div><div><span>Dinero restante</span><strong>{money(result.revenueRemaining, currency)}</strong></div><div><span>Porcentaje alcanzado</span><strong>{result.percentageReached === null ? "No disponible" : `${number(result.percentageReached)}%`}</strong></div></div><div className="break-even-progress" aria-label={`Avance de ventas: ${number(progress)}%`}><div className={`break-even-progress__bar break-even-progress__bar--${status?.tone ?? "unknown"}`} style={{ width: `${progress}%` }} /></div><p className="break-even-progress__caption">Ventas actuales: <strong>{money(result.revenue, currency)}</strong> de <strong>{money(result.breakEvenRevenue, currency)}</strong></p></Card>
    <section className="break-even-costs-grid"><Card><h2>Costos fijos utilizados</h2><div className="break-even-cost-group"><strong>Mensuales</strong>{monthlyCosts.length ? monthlyCosts.map((cost) => <div key={cost.id}><span>{cost.name}</span><b>{money(cost.appliedAmount, currency)}</b></div>) : <span className="muted">Sin costos mensuales</span>}</div><div className="break-even-cost-group"><strong>Anuales prorrateados</strong>{yearlyCosts.length ? yearlyCosts.map((cost) => <div key={cost.id}><span>{cost.name}</span><b>{money(cost.appliedAmount, currency)}</b></div>) : <span className="muted">Sin costos anuales</span>}</div><div className="break-even-cost-group"><strong>Únicos del mes</strong>{oneTimeCosts.length ? oneTimeCosts.map((cost) => <div key={cost.id}><span>{cost.name}</span><b>{money(cost.appliedAmount, currency)}</b></div>) : <span className="muted">Sin costos únicos</span>}</div></Card><Card><h2>Costos de productos</h2><div className="break-even-product-cost"><span>Costos variables registrados</span><strong>{money(result.variableCostsUsed?.productCosts ?? result.variableCosts, currency)}</strong></div><p className="muted">Se calculan con el costo histórico guardado en cada línea de venta.</p>{result.missingCostLines > 0 && <p className="break-even-missing"><AlertTriangle aria-hidden="true" />{number(result.missingCostLines)} líneas de venta no tienen costo registrado.</p>}</Card></section>
    {result.salesCount === 0 && <EmptyState title="Sin ventas en este mes" description="Selecciona otro mes o registra ventas completadas para obtener el cálculo." />}
  </section>;
}
