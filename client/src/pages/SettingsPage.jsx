import {
  BellRing,
  Building2,
  FileText,
  LogOut,
  Settings,
  UserRound,
  UsersRound
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

import { Button } from "../components/Button.jsx";
import { Card } from "../components/Card.jsx";
import { PageHeader } from "../components/PageHeader.jsx";
import { useAuth } from "../context/AuthContext.jsx";

function roleLabel(role) {
  return {
    owner: "Owner",
    manager: "Manager",
    viewer: "Viewer"
  }[role] ?? role;
}

export function SettingsPage() {
  const { logout, session } = useAuth();
  const navigate = useNavigate();
  const { activeBusiness, membership, permissions, user } = session;

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <>
      <PageHeader
        title="Configuración"
        description="Consulta la cuenta activa y accesos rápidos del negocio."
      />

      <section className="transfer-detail-grid">
        <Card>
          <p className="eyebrow">Cuenta actual</p>
          <dl className="detail-list">
            <div>
              <dt>Usuario</dt>
              <dd>{user.username}</dd>
            </div>
            <div>
              <dt>Correo</dt>
              <dd>{user.email}</dd>
            </div>
            <div>
              <dt>Rol global</dt>
              <dd>{user.platformRole === "super_admin" ? "Superadministrador" : "Usuario"}</dd>
            </div>
          </dl>
        </Card>

        <Card>
          <p className="eyebrow">Negocio activo</p>
          <dl className="detail-list">
            <div>
              <dt>Nombre</dt>
              <dd>{activeBusiness.name}</dd>
            </div>
            <div>
              <dt>Rol</dt>
              <dd>{roleLabel(membership.role)}</dd>
            </div>
            <div>
              <dt>Moneda</dt>
              <dd>{activeBusiness.currency}</dd>
            </div>
            <div>
              <dt>Zona horaria</dt>
              <dd>{activeBusiness.timezone}</dd>
            </div>
          </dl>
        </Card>
      </section>

      <section className="category-products">
        <header className="section-heading">
          <div>
            <p className="eyebrow">Accesos</p>
            <h2>Administración del espacio</h2>
          </div>
        </header>
        <section className="category-api-grid" aria-label="Accesos de configuración">
          <Card className="category-api-card">
            <Building2 aria-hidden="true" className="card-icon" />
            <h2>Cambiar negocio</h2>
            <p className="muted">Selecciona otro negocio disponible para tu cuenta.</p>
            <Link className="button button--secondary" to="/select-business">Cambiar negocio</Link>
          </Card>

          {permissions.canManageMembers && (
            <Card className="category-api-card">
              <UsersRound aria-hidden="true" className="card-icon" />
              <h2>Equipo</h2>
              <p className="muted">Gestiona miembros e invitaciones del negocio.</p>
              <Link className="button button--secondary" to="/app/members">Abrir equipo</Link>
            </Card>
          )}

          <Card className="category-api-card">
            <BellRing aria-hidden="true" className="card-icon" />
            <h2>Alertas</h2>
            <p className="muted">Revisa productos con stock bajo o agotado.</p>
            <Link className="button button--secondary" to="/app/alerts">Abrir alertas</Link>
          </Card>

          <Card className="category-api-card">
            <FileText aria-hidden="true" className="card-icon" />
            <h2>Reportes</h2>
            <p className="muted">Consulta existencias, movimientos y exportaciones.</p>
            <Link className="button button--secondary" to="/app/reports">Abrir reportes</Link>
          </Card>
        </section>
      </section>

      <section className="category-products">
        <header className="section-heading">
          <div>
            <p className="eyebrow">Sesión</p>
            <h2>Acceso de la cuenta</h2>
          </div>
        </header>
        <Card className="category-api-card">
          <UserRound aria-hidden="true" className="card-icon" />
          <h2>{user.username}</h2>
          <p className="muted">Puedes cerrar la sesión actual de forma segura.</p>
          <Button variant="danger" onClick={handleLogout}>
            <LogOut aria-hidden="true" />
            Cerrar sesión
          </Button>
        </Card>
      </section>
    </>
  );
}
