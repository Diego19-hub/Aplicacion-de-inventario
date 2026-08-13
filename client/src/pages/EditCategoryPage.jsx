import { ArrowLeft } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { apiRequest } from "../api/client.js";
import { Alert } from "../components/Alert.jsx";
import { Button } from "../components/Button.jsx";
import { Card } from "../components/Card.jsx";
import { CategoryForm } from "../components/CategoryForm.jsx";
import { EmptyState } from "../components/EmptyState.jsx";
import { PageHeader } from "../components/PageHeader.jsx";
import { Spinner } from "../components/Spinner.jsx";
import { useAuth } from "../context/AuthContext.jsx";

function errorsByField(fields = []) {
  return Object.fromEntries(fields.map((field) => [field.field, field.message]));
}

export function EditCategoryPage() {
  const { categoryId } = useParams();
  const { session } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", description: "" });
  const [errors, setErrors] = useState({});
  const [requestError, setRequestError] = useState("");
  const [loadError, setLoadError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadCategory = useCallback(async () => {
    if (!session.permissions.canManageInventory) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setLoadError(null);
    try {
      const response = await apiRequest(`/categories/${categoryId}/edit`);
      setForm({ name: response.category.name, description: response.category.description || "" });
    } catch (error) {
      setLoadError(error);
    } finally {
      setIsLoading(false);
    }
  }, [categoryId, session.permissions.canManageInventory]);

  useEffect(() => {
    loadCategory();
  }, [loadCategory]);

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
      const response = await apiRequest(`/categories/${categoryId}`, { method: "PUT", body: form, csrf: true });
      navigate(`/app/categories/${response.category.id}`);
    } catch (error) {
      setErrors(errorsByField(error.fields));
      setRequestError(error.message || "No fue posible actualizar la categoría.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!session.permissions.canManageInventory) return <EmptyState title="Acceso restringido" description="No tienes permiso para editar categorías en este negocio." action={<Link className="button button--secondary" to={`/app/categories/${categoryId}`}>Volver a la categoría</Link>} />;
  if (isLoading) return <section className="dashboard-state"><Spinner label="Cargando categoría" /></section>;
  if (loadError?.code === "CATEGORY_NOT_FOUND" || loadError?.code === "VALIDATION_ERROR") return <EmptyState title="Categoría no encontrada" description="La categoría no está disponible en el negocio activo." action={<Link className="button button--secondary" to="/app/categories">Volver a categorías</Link>} />;
  if (loadError) return <Alert><div className="dashboard-error"><span>No fue posible cargar la categoría.</span><Button variant="secondary" onClick={loadCategory}>Reintentar</Button></div></Alert>;
  return <>
    <Link to={`/app/categories/${categoryId}`} className="back-link"><ArrowLeft aria-hidden="true" />Volver a la categoría</Link>
    <PageHeader title="Editar categoría" description="Actualiza el nombre o la descripción." />
    <Card><CategoryForm form={form} errors={errors} requestError={requestError} isSubmitting={isSubmitting} submitLabel="Guardar cambios" cancelTo={`/app/categories/${categoryId}`} onChange={update} onSubmit={submit} /></Card>
  </>;
}
