import { Building2, ShieldCheck, UserRound } from "lucide-react";
import { Link } from "react-router-dom";

import { Card } from "../components/Card.jsx";
import { PageHeader } from "../components/PageHeader.jsx";
import { useAuth } from "../context/AuthContext.jsx";

export function DashboardPage() {
  const { session } = useAuth();
  const { activeBusiness, membership, permissions, user } = session;

  return (
    <>
      <PageHeader title={`Hola, ${user.username}`} description="Este es tu espacio de trabajo de Inventario." actions={<Link to="/select-business" className="button button--secondary">Cambiar negocio</Link>} />
      <div className="dashboard-grid">
        <Card><Building2 aria-hidden="true" className="card-icon" /><p className="eyebrow">Negocio activo</p><h2>{activeBusiness.name}</h2><p className="muted">{activeBusiness.timezone} · {activeBusiness.currency}</p></Card>
        <Card><UserRound aria-hidden="true" className="card-icon" /><p className="eyebrow">Tu rol</p><h2>{membership.role}</h2><p className="muted">Membresía {membership.status}</p></Card>
        <Card><ShieldCheck aria-hidden="true" className="card-icon" /><p className="eyebrow">Permisos</p><ul className="permission-list"><li>{permissions.canManageInventory ? "Puedes gestionar inventario" : "Consulta de inventario"}</li><li>{permissions.canManageMembers ? "Puedes gestionar miembros" : "Gestión de miembros no disponible"}</li></ul></Card>
      </div>
      <Card className="coming-soon"><h2>Tu panel está listo</h2><p>Los módulos operativos se irán habilitando gradualmente en esta nueva interfaz.</p></Card>
    </>
  );
}
