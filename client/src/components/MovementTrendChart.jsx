function formatShortDate(value) {
  if (!value) return "—";

  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "short"
  }).format(date);
}

export function MovementTrendChart({ data = [] }) {
  const movementTrend = data ?? [];
  if (movementTrend.length === 0) return null;

  const max = Math.max(...movementTrend.map((day) => Math.max(day.entries ?? 0, day.exits ?? 0)), 1);
  const points = (key) => movementTrend.map((day, index) => `${movementTrend.length === 1 ? 300 : (index / (movementTrend.length - 1)) * 580 + 10},${155 - ((day[key] ?? 0) / max) * 125}`).join(" ");

  return <div className="trend-chart" role="img" aria-label="Entradas y salidas de los últimos 30 días">
    <div className="trend-chart__legend"><span><i className="trend-dot trend-dot--entry" />Entradas</span><span><i className="trend-dot trend-dot--exit" />Salidas</span></div>
    <svg viewBox="0 0 600 180" preserveAspectRatio="none" aria-hidden="true"><line x1="10" y1="155" x2="590" y2="155" className="trend-axis" /><polyline className="trend-line trend-line--entry" points={points("entries")} /><polyline className="trend-line trend-line--exit" points={points("exits")} /></svg>
    <div className="trend-chart__dates"><span>{formatShortDate(movementTrend[0]?.date ?? "")}</span><span>{formatShortDate(movementTrend.at(-1)?.date ?? "")}</span></div>
  </div>;
}

export { formatShortDate };
