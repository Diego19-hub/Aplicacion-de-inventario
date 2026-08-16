import { ArrowLeft } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { apiRequest } from "../api/client.js";
import { Alert } from "../components/Alert.jsx";
import { AdminBusinessForm } from "../components/AdminBusinessForm.jsx";
import { Button } from "../components/Button.jsx";
import { Card } from "../components/Card.jsx";
import { PageHeader } from "../components/PageHeader.jsx";
import { Spinner } from "../components/Spinner.jsx";

const initialForm = { name: "", slug: "", legalName: "", taxId: "", currency: "MXN", timezone: "America/Mexico_City", ownerUserId: "" };

function errorsByField(fields = []) {
  return Object.fromEntries(fields.map((field) => [field.field, field.message]));
}

export function NewAdminBusinessPage() {
  const navigate = useNavigate();
  const [owners, setOwners] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState({});
  const [requestError, setRequestError] = useState("");
  const [loadError, setLoadError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadOptions = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const data = await apiRequest("/admin/businesses/form-options");
      setOwners(data.owners);
    } catch (error) {
      setLoadError(error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOptions();
  }, [loadOptions]);

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
      const data = await apiRequest("/admin/businesses", {
        method: "POST",
        body: { ...form, ownerUserId: Number(form.ownerUserId) },
        csrf: true
      });
      navigate(`/app/admin/businesses/${data.business.id}`);
    } catch (error) {
      setErrors(errorsByField(error.fields));
      setRequestError(error.message || "No fue posible crear el negocio.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) return <section className="dashboard-state"><Spinner label="Cargando opciones" /></section>;
  if (loadError) return <Alert><div className="dashboard-error"><span>No fue posible cargar las personas propietarias.</span><Button variant="secondary" onClick={loadOptions}>Reintentar</Button></div></Alert>;

  return <>
    <Link to="/app/admin/businesses" className="back-link"><ArrowLeft aria-hidden="true" />Volver a negocios</Link>
    <PageHeader title="Crear negocio" description="El negocio se creará activo con una persona propietaria y su ubicación principal." />
    <Card><AdminBusinessForm form={form} owners={owners} errors={errors} requestError={requestError} isCreate isSubmitting={isSubmitting} submitLabel="Crear negocio" cancelTo="/app/admin/businesses" onChange={update} onSubmit={submit} /></Card>
  </>;
}
