import { ArrowLeft } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { apiRequest } from "../api/client.js";
import { Alert } from "../components/Alert.jsx";
import { AdminBusinessForm } from "../components/AdminBusinessForm.jsx";
import { Button } from "../components/Button.jsx";
import { Card } from "../components/Card.jsx";
import { EmptyState } from "../components/EmptyState.jsx";
import { PageHeader } from "../components/PageHeader.jsx";
import { Spinner } from "../components/Spinner.jsx";

function errorsByField(fields = []) {
  return Object.fromEntries(fields.map((field) => [field.field, field.message]));
}

export function EditAdminBusinessPage() {
  const { businessId } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState(null);
  const [errors, setErrors] = useState({});
  const [requestError, setRequestError] = useState("");
  const [loadError, setLoadError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadBusiness = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const data = await apiRequest(`/admin/businesses/${businessId}/edit`);
      setForm({
        name: data.business.name,
        slug: data.business.slug,
        legalName: data.business.legalName || "",
        taxId: data.business.taxId || "",
        currency: data.business.currency,
        timezone: data.business.timezone
      });
    } catch (error) {
      setLoadError(error);
    } finally {
      setIsLoading(false);
    }
  }, [businessId]);

  useEffect(() => {
    loadBusiness();
  }, [loadBusiness]);

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
      await apiRequest(`/admin/businesses/${businessId}`, { method: "PUT", body: form, csrf: true });
      navigate(`/app/admin/businesses/${businessId}`);
    } catch (error) {
      setErrors(errorsByField(error.fields));
      setRequestError(error.message || "No fue posible actualizar el negocio.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) return <section className="dashboard-state"><Spinner label="Cargando negocio" /></section>;
  if (loadError?.code === "BUSINESS_NOT_FOUND" || loadError?.code === "VALIDATION_ERROR") return <EmptyState title="Negocio no encontrado" description="No hay un negocio disponible con ese identificador." action={<Link className="button button--secondary" to="/app/admin/businesses">Volver a negocios</Link>} />;
  if (loadError) return <Alert><div className="dashboard-error"><span>No fue posible cargar el negocio.</span><Button variant="secondary" onClick={loadBusiness}>Reintentar</Button></div></Alert>;

  return <>
    <Link to={`/app/admin/businesses/${businessId}`} className="back-link"><ArrowLeft aria-hidden="true" />Volver al negocio</Link>
    <PageHeader title="Editar negocio" description="Actualiza únicamente sus datos generales; el propietario y el estado no se modifican aquí." />
    <Card><AdminBusinessForm form={form} errors={errors} requestError={requestError} isCreate={false} isSubmitting={isSubmitting} submitLabel="Guardar cambios" cancelTo={`/app/admin/businesses/${businessId}`} onChange={update} onSubmit={submit} /></Card>
  </>;
}
