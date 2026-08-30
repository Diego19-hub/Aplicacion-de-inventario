import { MailCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { apiRequest } from "../api/client.js";
import { Alert } from "../components/Alert.jsx";
import { Button } from "../components/Button.jsx";
import { Card } from "../components/Card.jsx";
import { Spinner } from "../components/Spinner.jsx";
import { useAuth } from "../context/AuthContext.jsx";

const roleLabels = {
  manager: "Manager — puede gestionar inventario",
  viewer: "Consulta — solo puede consultar"
};

function formatDate(value) {
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "long",
    timeStyle: "short"
  }).format(new Date(value));
}

export function InvitationPage() {
  const { token = "" } = useParams();
  const navigate = useNavigate();
  const { isInitialLoading, logout, acceptInvitation } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [confirmed, setConfirmed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const returnTo = `/invitations/${encodeURIComponent(token)}`;
  const loginPath = `/login?${new URLSearchParams({ returnTo }).toString()}`;
  const registerPath = `/register?${new URLSearchParams({ returnTo }).toString()}`;

  const loadInvitation = useCallback(async ({ preserveError = false } = {}) => {
    setIsLoading(true);
    if (!preserveError) setError(null);
    try {
      setData(await apiRequest(`/invitations/${encodeURIComponent(token)}`));
    } catch (requestError) {
      setError(requestError);
      setData(null);
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadInvitation();
  }, [loadInvitation]);

  async function handleAccept() {
    if (!confirmed || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);
    try {
      const result = await acceptInvitation(token);
      navigate(result?.redirectPath || "/app", { replace: true });
    } catch (requestError) {
      setError(requestError);
      await loadInvitation({ preserveError: true });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleLogout() {
    try {
      await logout();
    } finally {
      navigate(loginPath, { replace: true });
    }
  }

  if (isInitialLoading || isLoading) {
    return <main className="auth-page"><Spinner label="Cargando invitación" /></main>;
  }

  if (!data || error?.code === "INVITATION_NOT_FOUND") {
    return (
      <main className="auth-page">
        <Card className="auth-card">
          <div className="auth-card__icon"><MailCheck aria-hidden="true" /></div>
          <div><p className="eyebrow">Invitación no disponible</p><h1>Este enlace no es válido</h1><p className="muted">La invitación pudo haber sido aceptada, revocada o ya no estar disponible.</p></div>
          <Link className="button button--primary" to={loginPath}>Iniciar sesión</Link>
        </Card>
      </main>
    );
  }

  const { invitation, session } = data;
  const isExpired = invitation.isExpired;

  return (
    <main className="auth-page">
      <Card className="auth-card">
        <div className="auth-card__icon"><MailCheck aria-hidden="true" /></div>
        <div>
          <p className="eyebrow">Invitación al equipo</p>
          <h1>{invitation.business.name}</h1>
          <p className="muted">Te invitaron a colaborar en este negocio.</p>
        </div>
        {error && <Alert>{error.message || "No fue posible aceptar la invitación."}</Alert>}
        <dl className="detail-list">
          <div><dt>Correo invitado</dt><dd>{invitation.email}</dd></div>
          <div><dt>Rol ofrecido</dt><dd>{roleLabels[invitation.offeredRole] || invitation.offeredRole}</dd></div>
          <div><dt>Vencimiento</dt><dd><time dateTime={invitation.expiresAt}>{formatDate(invitation.expiresAt)}</time></dd></div>
          <div><dt>Estado</dt><dd>{isExpired ? "Vencida" : "Pendiente"}</dd></div>
        </dl>
        {isExpired && <Alert>Esta invitación venció y ya no puede aceptarse.</Alert>}
        {!isExpired && !session.authenticated && (
          <div className="product-form__actions">
            <Link className="button button--primary" to={loginPath}>Iniciar sesión</Link>
            <Link className="button button--secondary" to={registerPath}>Crear cuenta</Link>
          </div>
        )}
        {!isExpired && session.authenticated && !session.emailMatches && (
          <>
            <Alert>Esta invitación corresponde a otro correo electrónico. Inicia sesión con la cuenta invitada para aceptarla.</Alert>
            <Button variant="secondary" onClick={handleLogout}>Cerrar sesión</Button>
          </>
        )}
        {!isExpired && session.authenticated && session.emailMatches && (
          <div className="stack">
            <p>La cuenta actual coincide con el correo invitado. Al aceptar, se activará tu acceso a este negocio.</p>
            <label className="archive-confirmation" htmlFor="confirm-invitation">
              <input id="confirm-invitation" type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} disabled={isSubmitting} />
              Confirmo que deseo aceptar esta invitación.
            </label>
            <Button onClick={handleAccept} disabled={!confirmed || isSubmitting}>{isSubmitting ? <Spinner label="Aceptando invitación" /> : "Aceptar invitación"}</Button>
          </div>
        )}
      </Card>
    </main>
  );
}
