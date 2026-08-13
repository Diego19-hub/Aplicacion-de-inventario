import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { apiRequest } from "../api/client.js";
import { Card } from "../components/Card.jsx";
import { EmptyState } from "../components/EmptyState.jsx";
import { LocationForm } from "../components/LocationForm.jsx";
import { PageHeader } from "../components/PageHeader.jsx";
import { useAuth } from "../context/AuthContext.jsx";

const initialForm = { name: "", code: "", locationType: "branch", address: "", phone: "", notes: "" };

function errorsByField(fields = []) {
  return Object.fromEntries(fields.map((field) => [field.field, field.message]));
}

export function NewLocationPage() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState({});
  const [requestError, setRequestError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

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
      const response = await apiRequest("/locations", { method: "POST", body: form, csrf: true });
      navigate(`/app/locations/${response.location.id}`);
    } catch (error) {
      setErrors(errorsByField(error.fields));
      setRequestError(error.message || "No fue posible crear la ubicación.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!session.permissions.canDeleteInventory) return <EmptyState title="Acceso restringido" description="Solo la persona propietaria puede crear ubicaciones." action={<Link className="button button--secondary" to="/app/locations">Volver a ubicaciones</Link>} />;
  return <>
    <Link to="/app/locations" className="back-link"><ArrowLeft aria-hidden="true" />Volver a ubicaciones</Link>
    <PageHeader title="Crear ubicación" description="Agrega una ubicación activa para el negocio." />
    <Card><LocationForm form={form} errors={errors} requestError={requestError} isSubmitting={isSubmitting} submitLabel="Crear ubicación" cancelTo="/app/locations" onChange={update} onSubmit={submit} /></Card>
  </>;
}
