import { ArrowLeft } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { apiRequest } from "../api/client.js";
import { Alert } from "../components/Alert.jsx";
import { Button } from "../components/Button.jsx";
import { Card } from "../components/Card.jsx";
import { EmptyState } from "../components/EmptyState.jsx";
import { LocationForm } from "../components/LocationForm.jsx";
import { PageHeader } from "../components/PageHeader.jsx";
import { Spinner } from "../components/Spinner.jsx";
import { useAuth } from "../context/AuthContext.jsx";

function errorsByField(fields = []) {
  return Object.fromEntries(fields.map((field) => [field.field, field.message]));
}

export function EditLocationPage() {
  const { locationId } = useParams();
  const { session } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState(null);
  const [errors, setErrors] = useState({});
  const [requestError, setRequestError] = useState("");
  const [loadError, setLoadError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadLocation = useCallback(async () => {
    if (!session.permissions.canDeleteInventory) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setLoadError(null);
    try {
      const response = await apiRequest(`/locations/${locationId}/edit`);
      setForm({
        name: response.location.name,
        code: response.location.code,
        locationType: response.location.locationType,
        address: response.location.address || "",
        phone: response.location.phone || "",
        notes: response.location.notes || ""
      });
    } catch (error) {
      setLoadError(error);
    } finally {
      setIsLoading(false);
    }
  }, [locationId, session.permissions.canDeleteInventory]);

  useEffect(() => {
    loadLocation();
  }, [loadLocation]);

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => {
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  async function submit(event) {
    event.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    setErrors({});
    setRequestError("");
    try {
      const response = await apiRequest(`/locations/${locationId}`, { method: "PUT", body: form, csrf: true });
      navigate(`/app/locations/${response.location.id}`);
    } catch (error) {
      setErrors(errorsByField(error.fields));
      setRequestError(error.message || "No fue posible actualizar la ubicación.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!session.permissions.canDeleteInventory) return <EmptyState title="Acceso restringido" description="Solo la persona propietaria puede editar ubicaciones." action={<Link className="button button--secondary" to={`/app/locations/${locationId}`}>Volver a la ubicación</Link>} />;
  if (isLoading) return <section className="dashboard-state"><Spinner label="Cargando ubicación" /></section>;
  if (loadError?.code === "LOCATION_NOT_FOUND" || loadError?.code === "VALIDATION_ERROR") return <EmptyState title="Ubicación no encontrada" description="La ubicación no está disponible en el negocio activo." action={<Link className="button button--secondary" to="/app/locations">Volver a ubicaciones</Link>} />;
  if (loadError) return <Alert><div className="dashboard-error"><span>No fue posible cargar la ubicación.</span><Button variant="secondary" onClick={loadLocation}>Reintentar</Button></div></Alert>;
  return <>
    <Link to={`/app/locations/${locationId}`} className="back-link"><ArrowLeft aria-hidden="true" />Volver a la ubicación</Link>
    <PageHeader title="Editar ubicación" description="Actualiza sus datos de contacto y operación." />
    <Card><LocationForm form={form} errors={errors} requestError={requestError} isSubmitting={isSubmitting} submitLabel="Guardar cambios" cancelTo={`/app/locations/${locationId}`} onChange={update} onSubmit={submit} /></Card>
  </>;
}
