import { Copy, Mail, UsersRound } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { apiRequest } from "../api/client.js";
import { Alert } from "../components/Alert.jsx";
import { Button } from "../components/Button.jsx";
import { Card } from "../components/Card.jsx";
import { EmptyState } from "../components/EmptyState.jsx";
import { Input } from "../components/Input.jsx";
import { PageHeader } from "../components/PageHeader.jsx";
import { Select } from "../components/Select.jsx";
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

function MemberCard({ member, canManage, onAction }) {
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
      {canManage && member.role !== "owner" && (
        <div className="product-form__actions">
          <Button variant="secondary" onClick={() => onAction(member, "role", member.role === "manager" ? "viewer" : "manager")}>Cambiar a {member.role === "manager" ? "Consulta" : "Manager"}</Button>
          {member.status === "active" && <Button variant="secondary" onClick={() => onAction(member, "suspend")}>Suspender</Button>}
          {["suspended", "removed"].includes(member.status) && <Button variant="secondary" onClick={() => onAction(member, "reactivate")}>Reactivar</Button>}
          {["active", "suspended"].includes(member.status) && <Button variant="danger" onClick={() => onAction(member, "remove")}>Remover</Button>}
        </div>
      )}
    </Card>
  );
}

function InvitationCard({ invitation, isRevoking, onStartRevoke, onCancelRevoke, onConfirmRevoke }) {
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
      {invitation.status === "pending" && !isRevoking && <Button variant="danger" onClick={() => onStartRevoke(invitation.id)}>Revocar</Button>}
      {isRevoking && (
        <div className="error-summary" role="alert">
          <p>Revocarás la invitación para {invitation.email}. Esta acción impedirá que se use el enlace.</p>
          <div className="product-form__actions">
            <Button variant="secondary" onClick={onCancelRevoke}>Cancelar</Button>
            <Button variant="danger" onClick={() => onConfirmRevoke(invitation.id)}>Confirmar revocación</Button>
          </div>
        </div>
      )}
    </Card>
  );
}

export function MembersPage() {
  const { session } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [invitationForm, setInvitationForm] = useState({ email: "", offeredRole: "viewer" });
  const [invitationErrors, setInvitationErrors] = useState({});
  const [invitationRequestError, setInvitationRequestError] = useState("");
  const [isCreatingInvitation, setIsCreatingInvitation] = useState(false);
  const [acceptancePath, setAcceptancePath] = useState("");
  const [copyMessage, setCopyMessage] = useState("");
  const [revokingInvitationId, setRevokingInvitationId] = useState(null);
  const [isRevokingInvitation, setIsRevokingInvitation] = useState(false);
  const [memberAction, setMemberAction] = useState(null);
  const [isUpdatingMember, setIsUpdatingMember] = useState(false);

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

  function updateInvitationField(field, value) {
    setInvitationForm((current) => ({ ...current, [field]: value }));
    setInvitationErrors((current) => {
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  async function createInvitation(event) {
    event.preventDefault();
    if (isCreatingInvitation) return;

    setIsCreatingInvitation(true);
    setInvitationErrors({});
    setInvitationRequestError("");
    setAcceptancePath("");
    setCopyMessage("");
    try {
      const response = await apiRequest("/members/invitations", {
        method: "POST",
        body: invitationForm,
        csrf: true
      });
      setInvitationForm({ email: "", offeredRole: "viewer" });
      setAcceptancePath(response.acceptancePath);
      await loadMembers();
    } catch (requestError) {
      setInvitationErrors(Object.fromEntries((requestError.fields || []).map((field) => [field.field, field.message])));
      setInvitationRequestError(requestError.message || "No fue posible crear la invitación.");
    } finally {
      setIsCreatingInvitation(false);
    }
  }

  async function copyAcceptancePath() {
    try {
      await navigator.clipboard.writeText(new URL(acceptancePath, window.location.origin).toString());
      setCopyMessage("Enlace copiado.");
    } catch {
      setCopyMessage("Selecciona y copia el enlace manualmente.");
    }
  }

  async function revokeInvitation(invitationId) {
    if (isRevokingInvitation) return;

    setIsRevokingInvitation(true);
    setInvitationRequestError("");
    try {
      await apiRequest(`/members/invitations/${invitationId}/revoke`, { method: "POST", csrf: true });
      setRevokingInvitationId(null);
      await loadMembers();
    } catch (requestError) {
      setInvitationRequestError(requestError.message || "No fue posible revocar la invitación.");
    } finally {
      setIsRevokingInvitation(false);
    }
  }

  async function confirmMemberAction() {
    if (!memberAction || isUpdatingMember) return;
    setIsUpdatingMember(true);
    setInvitationRequestError("");
    try {
      const { member, action, role } = memberAction;
      await apiRequest(`/members/${member.id}/${action === "role" ? "role" : action}`, {
        method: action === "role" ? "PUT" : "POST",
        body: action === "role" ? { role } : undefined,
        csrf: true
      });
      setMemberAction(null);
      await loadMembers();
    } catch (requestError) {
      setInvitationRequestError(requestError.message || "No fue posible actualizar el miembro.");
    } finally { setIsUpdatingMember(false); }
  }

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
        {memberAction && <Alert><div className="error-summary" role="alert"><p>Confirmas {memberAction.action === "role" ? `cambiar el rol a ${roleLabels[memberAction.role]}` : `${memberAction.action === "suspend" ? "suspender" : memberAction.action === "reactivate" ? "reactivar" : "remover"}`} a {memberAction.member.user.username}. {memberAction.action === "remove" && "Perderá el acceso al negocio."}</p><div className="product-form__actions"><Button variant="secondary" onClick={() => setMemberAction(null)} disabled={isUpdatingMember}>Cancelar</Button><Button variant={memberAction.action === "remove" ? "danger" : "primary"} onClick={confirmMemberAction} disabled={isUpdatingMember}>{isUpdatingMember ? "Actualizando…" : "Confirmar"}</Button></div></div></Alert>}
        {data.members.length === 0 ? <EmptyState title="Sin miembros" description="No hay membresías registradas para este negocio." /> : <section className="category-api-grid" aria-label="Miembros del negocio">{data.members.map((member) => <MemberCard key={member.id} member={member} canManage={session.permissions.canManageMembers} onAction={(member, action, role) => setMemberAction({ member, action, role })} />)}</section>}
      </section>

      <section className="category-products">
        <header className="section-heading"><div><p className="eyebrow">Invitaciones</p><h2>Invitar al equipo</h2></div></header>
        <Card>
          <form className="product-form" onSubmit={createInvitation} noValidate>
            {(invitationRequestError || Object.keys(invitationErrors).length > 0) && <Alert><div className="error-summary" role="alert"><strong>Revisa la invitación.</strong>{invitationRequestError && <p>{invitationRequestError}</p>}{Object.keys(invitationErrors).length > 0 && <ul>{Object.values(invitationErrors).map((message, index) => <li key={`${message}-${index}`}>{message}</li>)}</ul>}</div></Alert>}
            <Input id="invitation-email" label="Correo electrónico *" type="email" value={invitationForm.email} onChange={(event) => updateInvitationField("email", event.target.value)} error={invitationErrors.email} required />
            <Select id="invitation-offered-role" label="Rol ofrecido *" value={invitationForm.offeredRole} onChange={(event) => updateInvitationField("offeredRole", event.target.value)} error={invitationErrors.offeredRole} required>
              <option value="manager">Manager — puede gestionar inventario</option>
              <option value="viewer">Consulta — solo puede consultar</option>
            </Select>
            <div className="product-form__actions"><Button type="submit" disabled={isCreatingInvitation}>{isCreatingInvitation ? "Creando invitación…" : "Crear invitación"}</Button></div>
          </form>
          {acceptancePath && <Alert variant="success"><p><strong>Enlace de aceptación listo.</strong> Se muestra únicamente ahora; cópialo y envíalo de forma segura.</p><Input id="invitation-acceptance-path" label="Enlace de aceptación" value={new URL(acceptancePath, window.location.origin).toString()} readOnly /><Button variant="secondary" onClick={copyAcceptancePath}><Copy aria-hidden="true" />Copiar enlace</Button>{copyMessage && <p>{copyMessage}</p>}</Alert>}
        </Card>
      </section>

      <section className="category-products">
        <header className="section-heading"><div><p className="eyebrow">Historial</p><h2>Historial de invitaciones</h2></div></header>
        {data.invitations.length === 0 ? <EmptyState title="Sin invitaciones" description="No hay invitaciones registradas para este negocio." /> : <section className="category-api-grid" aria-label="Invitaciones del negocio">{data.invitations.map((invitation) => <InvitationCard key={invitation.id} invitation={invitation} isRevoking={revokingInvitationId === invitation.id} onStartRevoke={setRevokingInvitationId} onCancelRevoke={() => setRevokingInvitationId(null)} onConfirmRevoke={revokeInvitation} />)}</section>}
      </section>
    </>
  );
}
