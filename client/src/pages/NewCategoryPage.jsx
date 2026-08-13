import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { apiRequest } from "../api/client.js";
import { Card } from "../components/Card.jsx";
import { CategoryForm } from "../components/CategoryForm.jsx";
import { EmptyState } from "../components/EmptyState.jsx";
import { PageHeader } from "../components/PageHeader.jsx";
import { useAuth } from "../context/AuthContext.jsx";

function errorsByField(fields = []) {
  return Object.fromEntries(fields.map((field) => [field.field, field.message]));
}

export function NewCategoryPage() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", description: "" });
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
      const response = await apiRequest("/categories", { method: "POST", body: form, csrf: true });
      navigate(`/app/categories/${response.category.id}`);
    } catch (error) {
      setErrors(errorsByField(error.fields));
      setRequestError(error.message || "No fue posible crear la categoría.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!session.permissions.canManageInventory) return <EmptyState title="Acceso restringido" description="No tienes permiso para crear categorías en este negocio." action={<Link className="button button--secondary" to="/app/categories">Volver a categorías</Link>} />;
  return <>
    <Link to="/app/categories" className="back-link"><ArrowLeft aria-hidden="true" />Volver a categorías</Link>
    <PageHeader title="Crear categoría" description="Organiza productos del negocio con una categoría." />
    <Card><CategoryForm form={form} errors={errors} requestError={requestError} isSubmitting={isSubmitting} submitLabel="Crear categoría" cancelTo="/app/categories" onChange={update} onSubmit={submit} /></Card>
  </>;
}
