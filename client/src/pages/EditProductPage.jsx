import { ArrowLeft } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { apiRequest } from "../api/client.js";
import { Alert } from "../components/Alert.jsx";
import { Button } from "../components/Button.jsx";
import { Card } from "../components/Card.jsx";
import { EmptyState } from "../components/EmptyState.jsx";
import { PageHeader } from "../components/PageHeader.jsx";
import { ProductForm } from "../components/ProductForm.jsx";
import { Spinner } from "../components/Spinner.jsx";
import { useAuth } from "../context/AuthContext.jsx";

function fieldsByName(fields = []) {
  return Object.fromEntries(fields.map((field) => [field.field, field.message]));
}

export function EditProductPage() {
  const { productId } = useParams();
  const { session } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);
  const [errors, setErrors] = useState({});
  const [requestError, setRequestError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const loadProduct = useCallback(async () => {
    if (!session.permissions.canManageInventory) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setRequestError("");
    setNotFound(false);
    try {
      const result = await apiRequest(`/products/${productId}/edit`);
      const defaultCategory = result.categories.find((category) => category.isDefault);
      setData(result);
      setForm({
        name: result.product.name,
        description: result.product.description ?? "",
        brand: result.product.brand,
        price: String(result.product.price),
        costPrice: result.product.costPrice === null || result.product.costPrice === undefined ? "" : String(result.product.costPrice),
        categoryId: defaultCategory?.id === result.product.categoryId ? "" : String(result.product.categoryId),
        sku: result.product.sku,
        barcode: result.product.barcode ?? ""
      });
    } catch (error) {
      if (error.code === "PRODUCT_NOT_FOUND") setNotFound(true);
      else setRequestError(error.message || "No fue posible cargar el producto.");
    } finally {
      setIsLoading(false);
    }
  }, [productId, session.permissions.canManageInventory]);

  useEffect(() => { loadProduct(); }, [loadProduct]);

  function updateField(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
    setErrors((current) => {
      const next = { ...current };
      delete next[name];
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
      await apiRequest(`/products/${productId}`, { method: "PUT", body: form, csrf: true });
      navigate(`/app/products/${productId}`);
    } catch (error) {
      if (error.code === "PRODUCT_NOT_FOUND") {
        setNotFound(true);
      } else if (["VALIDATION_ERROR", "SKU_ALREADY_EXISTS", "BARCODE_ALREADY_EXISTS"].includes(error.code)) {
        setErrors(fieldsByName(error.fields));
        setRequestError(error.message);
      } else {
        setRequestError(error.message || "No fue posible guardar los cambios.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!session.permissions.canManageInventory) {
    return <EmptyState title="Acceso restringido" description="No tienes permiso para editar productos en este negocio." action={<Link className="button button--secondary" to={`/app/products/${productId}`}>Volver al producto</Link>} />;
  }

  if (isLoading) return <section className="dashboard-state"><Spinner label="Cargando producto" /></section>;
  if (notFound) return <EmptyState title="Producto no disponible" description="El producto fue archivado o ya no está disponible en el negocio activo." action={<Link className="button button--secondary" to="/app/products">Volver a productos</Link>} />;
  if (requestError && !data) return <Alert><div className="dashboard-error"><span>{requestError}</span><Button variant="secondary" onClick={loadProduct}>Reintentar</Button></div></Alert>;

  return <>
    <Link to={`/app/products/${productId}`} className="back-link"><ArrowLeft aria-hidden="true" />Volver al producto</Link>
    <PageHeader title="Editar producto" description="Actualiza la información sin modificar sus existencias." />
    <Card><ProductForm mode="edit" form={form} categories={data.categories} currency={session.activeBusiness.currency} errors={errors} summaryError={requestError} isSubmitting={isSubmitting} cancelTo={`/app/products/${productId}`} onChange={updateField} onSubmit={submit} /></Card>
  </>;
}
