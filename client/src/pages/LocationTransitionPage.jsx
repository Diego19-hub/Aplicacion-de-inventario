import { AlertTriangle, ArrowLeft } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { apiRequest } from "../api/client.js";
import { Alert } from "../components/Alert.jsx";
import { Button } from "../components/Button.jsx";
import { Card } from "../components/Card.jsx";
import { EmptyState } from "../components/EmptyState.jsx";
import { PageHeader } from "../components/PageHeader.jsx";
import { Spinner } from "../components/Spinner.jsx";
import { useAuth } from "../context/AuthContext.jsx";

const actionDetails = {
  "make-default": {
    title: "Convertir en principal",
    button: "Convertir en principal",
    confirmation: "Confirmo que quiero convertir esta ubicación en la principal.",
    consequence: "Sustituirá a la ubicación principal actual del negocio."
  },
  deactivate: {
    title: "Desactivar ubicación",
    button: "Desactivar ubicación",
    confirmation: "Confirmo que quiero desactivar esta ubicación.",
    consequence: "Dejará de estar disponible para nuevos movimientos y transferencias."
  },
  reactivate: {
    title: "Reactivar ubicación",
    button: "Reactivar ubicación",
    confirmation: "Confirmo que quiero reactivar esta ubicación.",
    consequence: "Volverá a estar disponible, pero no se convertirá en principal automáticamente."
  }
};

const errorMessages = {
  LOCATION_INACTIVE: "La ubicación está inactiva y no puede convertirse en principal.",
  LOCATION_ALREADY_DEFAULT: "La ubicación ya es la principal.",
  DEFAULT_LOCATION_REQUIRED: "No puedes desactivar la ubicación principal.",
  LOCATION_HAS_STOCK: "La ubicación tiene stock. Transfiérelo o ajústalo a cero antes de desactivarla.",
  LOCATION_ALREADY_INACTIVE: "La ubicación ya está inactiva.",
  LOCATION_ALREADY_ACTIVE: "La ubicación ya está activa."
};

export function LocationTransitionPage({ action }) {
  const { locationId } = useParams();
  const { session } = useAuth();
  const navigate = useNavigate();
  const details = useMemo(() => actionDetails[action], [action]);
  const [location, setLocation] = useState(null);
  const [error, setError] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const loadLocation = useCallback(async () => {
    if (!session.permissions.canDeleteInventory) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError("");
    setNotFound(false);
    try {
      const response = await apiRequest(`/locations/${locationId}`);
      setLocation(response.location);
    } catch (requestError) {
      if (requestError.code === "LOCATION_NOT_FOUND" || requestError.code === "VALIDATION_ERROR") {
        setNotFound(true);
      } else {
        setError(requestError.message || "No fue posible cargar la ubicación.");
      }
    } finally {
      setIsLoading(false);
    }
  }, [locationId, session.permissions.canDeleteInventory]);

  useEffect(() => {
    loadLocation();
  }, [loadLocation]);

  const transitionAllowed = location && (
    (action === "make-default" && location.status === "active" && !location.isDefault) ||
    (action === "deactivate" && location.status === "active" && !location.isDefault && location.totalStock === 0) ||
    (action === "reactivate" && location.status === "inactive")
  );

  async function submit(event) {
    event.preventDefault();
    if (isSubmitting || !confirmed || !transitionAllowed) return;
    setIsSubmitting(true);
    setError("");
    try {
      await apiRequest(`/locations/${locationId}/${action}`, { method: "POST", csrf: true });
      navigate(`/app/locations/${locationId}`, { replace: true });
    } catch (requestError) {
      if (requestError.code === "LOCATION_NOT_FOUND") {
        setNotFound(true);
      } else {
        setError(errorMessages[requestError.code] || requestError.message || "No fue posible actualizar la ubicación.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!session.permissions.canDeleteInventory) return <EmptyState title="Acceso restringido" description="Solo la persona propietaria puede cambiar el estado o la ubicación principal." action={<Link className="button button--secondary" to={`/app/locations/${locationId}`}>Volver a la ubicación</Link>} />;
  if (isLoading) return <section className="dashboard-state"><Spinner label="Cargando ubicación" /></section>;
  if (notFound) return <EmptyState title="Ubicación no disponible" description="La ubicación ya no está disponible en el negocio activo." action={<Link className="button button--secondary" to="/app/locations">Volver a ubicaciones</Link>} />;
  if (error && !location) return <Alert><div className="dashboard-error"><span>{error}</span><Button variant="secondary" onClick={loadLocation}>Reintentar</Button></div></Alert>;

  const unavailableExplanation = action === "deactivate" && location.totalStock > 0
    ? "Esta ubicación tiene stock. Primero debes transferirlo o ajustarlo a cero."
    : "Esta transición ya no está disponible para el estado actual de la ubicación.";
  return <section className="archive-product-page">
    <Link to={`/app/locations/${locationId}`} className="back-link"><ArrowLeft aria-hidden="true" />Volver a la ubicación</Link>
    <PageHeader title={details.title} description={details.consequence} />
    <Card className="archive-product-card">
      <div><p className="eyebrow">Ubicación seleccionada</p><h2>{location.name}</h2><p className="muted">Código: {location.code}</p><p className="muted">Estado actual: {location.status === "active" ? "Activa" : "Inactiva"}</p></div>
      <div className="archive-warning" role="note"><strong><AlertTriangle aria-hidden="true" /> Confirmación requerida</strong><p>{details.consequence}</p></div>
      {error && <Alert><span>{error}</span></Alert>}
      {!transitionAllowed && <Alert variant="warning"><span>{unavailableExplanation}</span></Alert>}
      <form className="product-form" onSubmit={submit}>
        <label className="archive-confirmation" htmlFor="location-transition-confirm"><input id="location-transition-confirm" type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} disabled={!transitionAllowed || isSubmitting} /><span>{details.confirmation}</span></label>
        <div className="product-form__actions"><Link className="button button--secondary" to={`/app/locations/${locationId}`}>Cancelar</Link><Button type="submit" variant={action === "deactivate" ? "danger" : "primary"} disabled={!transitionAllowed || !confirmed || isSubmitting}>{isSubmitting ? "Guardando…" : details.button}</Button></div>
      </form>
    </Card>
  </section>;
}
