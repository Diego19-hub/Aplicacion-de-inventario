import { Mail, UsersRound } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { apiRequest } from "../api/client.js";
import { Alert } from "../components/Alert.jsx";
import { Button } from "../components/Button.jsx";
import { Card } from "../components/Card.jsx";
import { EmptyState } from "../components/EmptyState.jsx";
import { PageHeader } from "../components/PageHeader.jsx";
import { Spinner } from "../components/Spinner.jsx";
import { useAuth } from "../context/AuthContext.jsx";

const roleLabels = {
  owner: "Propietario",
  manager: "Manager",
  viewer: "Consulta"
};

const memberStatusLabels = {
  active: "Activo",
  suspended: "Suspendido",
  removed: "Removido"
};

const invitationStatusLabels = {
  pending: "Pendiente",
  accepted: "Aceptada",
  revoked: "Revocada",
  expired: "Vencida"
};

function formatDate(value) {
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function MemberCard({ member }) {
  return (
    <Card className="category-api-card">
      <div>
        <h2>{member.user.username} {member.isCurrentUser && <span className="muted">(Tú)</span>}</h2>
        <a className="text-link" href={`mailto:${member.user.email}`}><Mail aria-hidden="true" />{member.user.email}</a>
      </div>
      <dl>
        <div><dt>Rol</dt><dd>{roleLabels[member.role] || member.role}</dd></div>
        <div><dt>Estado</dt><dd>{memberStatusLabels[member.status] || member.status}</dd></div>
        <div><dt>Incorporación</dt><dd><time dateTime={member.joinedAt}>{formatDate(member.joinedAt)}</time></dd></div>
      </dl>
    </Card>
  );
}

function InvitationCard({ invitation }) {
  return (
    <Card className="category-api-card">
      <div>
        <h2>{invitation.email}</h2>
        <p className="muted">Invitada por {invitation.invitedBy.username}</p>
      </div>
      <dl>
        <div><dt>Rol ofrecido</dt><dd>{roleLabels[invitation.offeredRole] || invitation.offeredRole}</dd></div>
        <div><dt>Estado</dt><dd>{invitationStatusLabels[invitation.status] || invitation.status}</dd></div>
        <div><dt>Vencimiento</dt><dd><time dateTime={invitation.expiresAt}>{formatDate(invitation.expiresAt)}</time></dd></div>
        {invitation.isExpired && <div><dt>Disponibilidad</dt><dd>Invitación pendiente vencida</dd></div>}
      </dl>
    </Card>
  );
}

export function MembersPage() {
  const { session } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadMembers = useCallback(async () => {
    if (!session.permissions.canManageMembers) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      setData(await apiRequest("/members"));
    } catch (requestError) {
      setError(requestError);
    } finally {
      setIsLoading(false);
    }
  }, [session.activeBusiness?.id, session.permissions.canManageMembers]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  if (!session.permissions.canManageMembers) {
    return <EmptyState title="Acceso restringido" description="Solo la persona propietaria puede consultar el equipo." action={<Link className="button button--secondary" to="/app">Volver al dashboard</Link>} />;
  }
  if (isLoading) return <section className="dashboard-state"><Spinner label="Cargando equipo" /></section>;
  if (error) return <Alert><div className="dashboard-error"><span>No fue posible cargar el equipo.</span><Button variant="secondary" onClick={loadMembers}>Reintentar</Button></div></Alert>;

  return (
    <>
      <PageHeader title="Equipo" description={`Administración del equipo de ${session.activeBusiness.name}.`} />
      <section className="category-detail-metrics" aria-label="Resumen del equipo">
        <Card><p className="eyebrow">Miembros activos</p><strong>{data.summary.activeMembers}</strong></Card>
        <Card><p className="eyebrow">Invitaciones pendientes</p><strong>{data.summary.pendingInvitations}</strong></Card>
      </section>

      <section className="category-products">
        <header className="section-heading"><div><p className="eyebrow">Miembros</p><h2>Equipo del negocio</h2></div></header>
        {data.members.length === 0 ? <EmptyState title="Sin miembros" description="No hay membresías registradas para este negocio." /> : <section className="category-api-grid" aria-label="Miembros del negocio">{data.members.map((member) => <MemberCard key={member.id} member={member} />)}</section>}
      </section>

      <section className="category-products">
        <header className="section-heading"><div><p className="eyebrow">Invitaciones</p><h2>Historial de invitaciones</h2></div></header>
        {data.invitations.length === 0 ? <EmptyState title="Sin invitaciones" description="No hay invitaciones registradas para este negocio." /> : <section className="category-api-grid" aria-label="Invitaciones del negocio">{data.invitations.map((invitation) => <InvitationCard key={invitation.id} invitation={invitation} />)}</section>}
      </section>
    </>
  );
}
