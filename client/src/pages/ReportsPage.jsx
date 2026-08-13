import { Link } from "react-router-dom";
import { Card } from "../components/Card.jsx";
import { PageHeader } from "../components/PageHeader.jsx";

export function ReportsPage() {
  return <><PageHeader title="Reportes" description="Consulta información consolidada de tu inventario." /><section className="category-api-grid"><Card className="category-api-card"><h2>Existencias por ubicación</h2><p className="muted">Consulta stock local y total por producto.</p><Link className="button button--primary" to="/app/reports/inventory">Abrir reporte</Link></Card><Card className="category-api-card"><h2>Movimientos</h2><p className="muted">Próximamente.</p></Card></section></>;
}
