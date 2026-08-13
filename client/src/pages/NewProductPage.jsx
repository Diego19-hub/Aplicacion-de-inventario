import { ArrowLeft } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { apiRequest } from "../api/client.js";
import { Alert } from "../components/Alert.jsx";
import { Button } from "../components/Button.jsx";
import { Card } from "../components/Card.jsx";
import { EmptyState } from "../components/EmptyState.jsx";
import { PageHeader } from "../components/PageHeader.jsx";
import { ProductForm } from "../components/ProductForm.jsx";
import { Spinner } from "../components/Spinner.jsx";
import { useAuth } from "../context/AuthContext.jsx";

const initialForm = {
  name: "",
  description: "",
  brand: "",
  price: "",
  categoryId: "",
  sku: ""
};

function fieldsByName(fields = []) {
  return Object.fromEntries(fields.map((field) => [field.field, field.message]));
}

export function NewProductPage() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [options, setOptions] = useState(null);
  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState({});
  const [requestError, setRequestError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadOptions = useCallback(async () => {
    setIsLoading(true);
    setRequestError("");
    try {
      setOptions(await apiRequest("/products/form-options"));
    } catch (error) {
      setRequestError(error.message || "No fue posible cargar las opciones del formulario.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { loadOptions(); }, [loadOptions]);

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
    if (isSubmitting || !options?.categories.length) return;

    setIsSubmitting(true);
    setErrors({});
    setRequestError("");
    try {
      const data = await apiRequest("/products", { method: "POST", body: form, csrf: true });
      navigate(`/app/products/${data.product.id}`);
    } catch (error) {
      if (error.code === "VALIDATION_ERROR" || error.code === "SKU_ALREADY_EXISTS") {
        setErrors(fieldsByName(error.fields));
        setRequestError(error.message);
      } else {
        setRequestError(error.message || "No fue posible crear el producto.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!session.permissions.canManageInventory) {
    return <EmptyState title="Acceso restringido" description="No tienes permiso para crear productos en este negocio." action={<Link className="button button--secondary" to="/app/products">Volver a productos</Link>} />;
  }

  if (isLoading) return <section className="dashboard-state"><Spinner label="Cargando opciones del formulario" /></section>;
  if (requestError && !options) return <Alert><div className="dashboard-error"><span>{requestError}</span><Button variant="secondary" onClick={loadOptions}>Reintentar</Button></div></Alert>;

  if (!options.categories.length) {
    return <>
      <Link to="/app/products" className="back-link"><ArrowLeft aria-hidden="true" />Volver a productos</Link>
      <EmptyState title="Primero necesitas una categoría" description="No hay categorías disponibles en el negocio activo. Un producto debe pertenecer a una categoría antes de poder registrarse." action={<Link className="button button--secondary" to="/app/products">Volver a productos</Link>} />
    </>;
  }

  const currency = session.activeBusiness.currency;

  return <>
    <Link to="/app/products" className="back-link"><ArrowLeft aria-hidden="true" />Volver a productos</Link>
    <PageHeader title="Crear producto" description="El producto iniciará con existencias en cero." />
    <Card>
      <ProductForm mode="create" form={form} categories={options.categories} currency={currency} errors={errors} summaryError={requestError} isSubmitting={isSubmitting} cancelTo="/app/products" onChange={updateField} onSubmit={submit} />
    </Card>
  </>;
}
