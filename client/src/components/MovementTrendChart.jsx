const SERIES_COLORS = { entries: "#4338CA", exits: "#B42318", adjustments: "#B45309", net: "#047857" };
const SERIES = [
  { key: "entries", label: "Entradas", description: "Unidades que aumentan el inventario.", color: SERIES_COLORS.entries, type: "bar" },
  { key: "exits", label: "Salidas", description: "Unidades que disminuyen el inventario.", color: SERIES_COLORS.exits, type: "bar" },
  { key: "adjustments", label: "Ajustes", description: "Correcciones manuales positivas o negativas.", color: SERIES_COLORS.adjustments, type: "bar" },
  { key: "netChange", label: "Balance neto", description: "Entradas - Salidas + Ajustes.", color: SERIES_COLORS.net, type: "line" }
];

function formatShortDate(value) {
  if (!value) return "—";
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "short" }).format(date);
}

function finiteValue(value) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function niceStep(range) {
  const rough = range / 5;
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(rough, 1)));
  const normalized = rough / magnitude;
  return (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * magnitude;
}

function formatValue(value) {
  const number = finiteValue(value);
  return `${number > 0 ? "+" : ""}${number}`;
}

export function MovementTrendChart({ data = [], totals = {} }) {
  const movementTrend = (data ?? []).map((day) => ({ ...day, entries: finiteValue(day.entries), exits: finiteValue(day.exits), adjustments: finiteValue(day.adjustments), netChange: finiteValue(day.netChange) }));
  if (movementTrend.length === 0) return null;
  const values = movementTrend.flatMap((day) => [day.entries, day.exits, day.adjustments, day.netChange]);
  const rawMin = Math.min(...values, 0);
  const rawMax = Math.max(...values, 0);
  const range = rawMax - rawMin || 10;
  const margin = range * .15;
  const step = niceStep(range + margin * 2);
  const min = Math.floor((rawMin - margin) / step) * step;
  const max = Math.ceil((rawMax + margin) / step) * step || 10;
  const tickCount = Math.min(6, Math.max(4, Math.round((max - min) / step) + 1));
  const ticks = Array.from({ length: tickCount }, (_, index) => min + ((max - min) / (tickCount - 1)) * index);
  const chartWidth = 900;
  const chartHeight = 360;
  const plotTop = 24;
  const paddingBottom = 64;
  const plotBottom = chartHeight - paddingBottom;
  const plotLeft = 58;
  const plotRight = 20;
  const plotWidth = chartWidth - plotLeft - plotRight;
  const plotHeight = plotBottom - plotTop;
  const baseline = plotBottom - ((0 - min) / (max - min || 1)) * plotHeight;
  const x = (index) => movementTrend.length === 1 ? plotLeft + plotWidth / 2 : plotLeft + (index / (movementTrend.length - 1)) * plotWidth;
  const y = (value) => plotBottom - ((finiteValue(value) - min) / (max - min || 1)) * plotHeight;
  const groupWidth = Math.min(42, plotWidth / Math.max(movementTrend.length, 1) * .72);
  const barWidth = Math.max(4, (groupWidth - 6) / 3);
  const labelIndexes = [...new Set([0, ...Array.from({ length: 4 }, (_, index) => Math.round(index * (movementTrend.length - 1) / 4)), movementTrend.length - 1])];
  const labelFor = (day) => day.label || formatShortDate(day.date);
  const nonZeroSeries = SERIES.filter(({ key, type }) => type === "bar" && movementTrend.some((day) => day[key] !== 0));
  const sparseSeries = nonZeroSeries.length === 1 ? nonZeroSeries[0] : null;
  const sparseDay = sparseSeries ? movementTrend.find((day) => day[sparseSeries.key] !== 0) : null;
  const bar = (day, index, key, color, offset) => {
    const value = day[key];
    const height = Math.max(Math.abs(y(value) - baseline), value === 0 ? 0 : 1);
    return <rect key={`${key}-${day.date}`} x={x(index) - groupWidth / 2 + offset} y={value >= 0 ? y(value) : baseline} width={barWidth} height={height} rx="2" fill={color} aria-label={`${key} ${labelFor(day)}: ${formatValue(value)} unidades`}><title>{`${labelFor(day)}\n${key === "entries" ? "Entradas" : key === "exits" ? "Salidas" : "Ajustes"}: ${formatValue(value)} unidades`}</title></rect>;
  };
  return <div className="movement-trend" aria-label="Evolución de movimientos del inventario">
    <div className="movement-trend__legend" aria-label="Leyenda de series">{SERIES.map((item) => <span key={item.key} title={item.description}><i className={`movement-trend__legend-sample movement-trend__legend-sample--${item.type}`} style={item.type === "bar" ? { backgroundColor: item.color } : { borderTopColor: item.color }} aria-hidden="true" />{item.label}</span>)}</div>
    <p className="movement-trend__help">Entradas: unidades que aumentan el inventario · Salidas: unidades que disminuyen el inventario · Ajustes: correcciones manuales positivas o negativas · Balance neto: Entradas - Salidas + Ajustes.</p>
    {sparseSeries && sparseDay && <p className="movement-trend__annotation" aria-live="polite">{formatValue(sparseDay[sparseSeries.key])} {sparseSeries.label.toLowerCase()} el {labelFor(sparseDay)}</p>}
    <div className="movement-trend__plot"><div className="movement-trend__viewport"><svg className="movement-trend__svg" viewBox="0 0 900 360" role="img" aria-label="Barras de entradas, salidas y ajustes, con línea de balance neto">
      {ticks.map((tick) => <g key={tick}><line x1={plotLeft} y1={y(tick)} x2={chartWidth - plotRight} y2={y(tick)} className="trend-grid-line" /><text x={plotLeft - 10} y={y(tick) + 5} textAnchor="end" className="trend-axis-label">{Math.round(tick)}</text></g>)}
      <line x1={plotLeft} y1={baseline} x2={chartWidth - plotRight} y2={baseline} className="trend-zero-line" />
      <g aria-label="Entradas">{movementTrend.map((day, index) => bar(day, index, "entries", SERIES_COLORS.entries, -groupWidth / 2))}</g>
      <g aria-label="Salidas">{movementTrend.map((day, index) => bar(day, index, "exits", SERIES_COLORS.exits, -groupWidth / 2 + barWidth + 2))}</g>
      <g aria-label="Ajustes">{movementTrend.map((day, index) => bar(day, index, "adjustments", SERIES_COLORS.adjustments, -groupWidth / 2 + (barWidth + 2) * 2))}</g>
      <polyline points={movementTrend.map((day, index) => `${x(index)},${y(day.netChange)}`).join(" ")} fill="none" stroke={SERIES_COLORS.net} className="trend-line trend-line--net" aria-label="Balance neto" />
      {movementTrend.map((day, index) => <circle key={`net-${day.date}`} cx={x(index)} cy={y(day.netChange)} r="4" fill={SERIES_COLORS.net} className="trend-point"><title>{`${labelFor(day)}\nEntradas: ${formatValue(day.entries)} unidades\nSalidas: ${formatValue(day.exits)} unidades\nAjustes: ${formatValue(day.adjustments)} unidades\nBalance neto: ${formatValue(day.netChange)} unidades`}</title></circle>)}
      {labelIndexes.map((index, labelIndex) => <text key={`label-${movementTrend[index].date}`} x={x(index)} y={338} textAnchor={labelIndex === 0 ? "start" : labelIndex === labelIndexes.length - 1 ? "end" : "middle"} className="trend-date-label">{labelFor(movementTrend[index])}</text>)}
    </svg></div></div>
    <div className="movement-trend__summary"><span className="trend-summary--entry"><b>Entradas</b><strong style={{ color: SERIES_COLORS.entries }}>{formatValue(totals.entries)} unidades</strong></span><span className="trend-summary--exit"><b>Salidas</b><strong style={{ color: SERIES_COLORS.exits }}>{formatValue(totals.exits)} unidades</strong></span><span className="trend-summary--adjustment"><b>Ajustes</b><strong style={{ color: SERIES_COLORS.adjustments }}>{formatValue(totals.adjustments)} unidades</strong></span><span className="trend-summary--net"><b>Balance neto</b><strong style={{ color: SERIES_COLORS.net }}>{formatValue(totals.netChange)} unidades</strong></span></div>
    <p className="movement-trend__summary-help">El balance neto representa el cambio total del inventario en el periodo seleccionado.</p>
  </div>;
}

export { SERIES_COLORS, formatShortDate };
