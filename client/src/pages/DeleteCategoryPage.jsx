import { AlertTriangle, ArrowLeft } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { apiRequest } from "../api/client.js";
import { Alert } from "../components/Alert.jsx";
import { Button } from "../components/Button.jsx";
import { Card } from "../components/Card.jsx";
import { EmptyState } from "../components/EmptyState.jsx";
import { PageHeader } from "../components/PageHeader.jsx";
import { Spinner } from "../components/Spinner.jsx";
import { useAuth } from "../context/AuthContext.jsx";

export function DeleteCategoryPage() {
  const { categoryId } = useParams();
  const { session } = useAuth();
  const navigate = useNavigate();
  const [category, setCategory] = useState(null);
  const [error, setError] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadCategory = useCallback(async () => {
    if (!session.permissions.canDeleteInventory) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError("");
    setNotFound(false);
    try {
      const response = await apiRequest(`/categories/${categoryId}`);
      setCategory(response.category);
    } catch (requestError) {
      if (requestError.code === "CATEGORY_NOT_FOUND" || requestError.code === "VALIDATION_ERROR") {
        setNotFound(true);
      } else {
        setError(requestError.message || "No fue posible cargar la categoría.");
      }
    } finally {
      setIsLoading(false);
    }
  }, [categoryId, session.permissions.canDeleteInventory]);

  useEffect(() => {
    loadCategory();
  }, [loadCategory]);

  async function remove() {
    if (isSubmitting || !category) return;
    setIsSubmitting(true);
    setError("");
    try {
      await apiRequest(`/categories/${categoryId}`, { method: "DELETE", csrf: true });
      navigate("/app/categories");
    } catch (requestError) {
      if (requestError.code === "CATEGORY_NOT_FOUND") {
        setNotFound(true);
      } else if (requestError.code === "CATEGORY_IN_USE") {
        setError("La categoría tiene productos asociados. Cámbialos de categoría antes de eliminarla.");
      } else {
        setError(requestError.message || "No fue posible eliminar la categoría.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!session.permissions.canDeleteInventory) {
    return <EmptyState title="Acceso restringido" description="Solo la persona propietaria puede eliminar categorías." action={<Link className="button button--secondary" to={`/app/categories/${categoryId}`}>Volver a la categoría</Link>} />;
  }
  if (isLoading) return <section className="dashboard-state"><Spinner label="Cargando categoría" /></section>;
  if (notFound) return <EmptyState title="Categoría no disponible" description="La categoría ya no está disponible en el negocio activo." action={<Link className="button button--secondary" to="/app/categories">Volver a categorías</Link>} />;
  if (error && !category) return <Alert><div className="dashboard-error"><span>{error}</span><Button variant="secondary" onClick={loadCategory}>Reintentar</Button></div></Alert>;

  const hasProducts = category.activeProductCount > 0 || category.archivedProductCount > 0;
  return <section className="archive-product-page">
    <Link to={`/app/categories/${categoryId}`} className="back-link"><ArrowLeft aria-hidden="true" />Volver a la categoría</Link>
    <PageHeader title="Eliminar categoría" description="Esta acción elimina la categoría de forma permanente." />
    <Card className="archive-product-card">
      <div><p className="eyebrow">Categoría seleccionada</p><h2>{category.name}</h2>{category.description && <p className="muted">{category.description}</p>}</div>
      <dl className="category-detail-metrics"><div><dt>Productos activos</dt><dd>{category.activeProductCount}</dd></div><div><dt>Productos archivados</dt><dd>{category.archivedProductCount}</dd></div></dl>
      <div className="archive-warning" role="note"><strong><AlertTriangle aria-hidden="true" /> Eliminación permanente</strong><p>{hasProducts ? "Debes cambiar los productos activos y archivados a otra categoría antes de eliminarla." : "Esta acción no se puede deshacer."}</p></div>
      {error && <Alert><span>{error}</span></Alert>}
      <div className="product-form__actions"><Link className="button button--secondary" to={`/app/categories/${categoryId}`}>Cancelar</Link><Button variant="danger" onClick={remove} disabled={hasProducts || isSubmitting}>{isSubmitting ? "Eliminando categoría…" : "Eliminar categoría"}</Button></div>
    </Card>
  </section>;
}
