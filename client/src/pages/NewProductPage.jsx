import { ArrowLeft } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { apiRequest } from "../api/client.js";
import { Alert } from "../components/Alert.jsx";
import { Button } from "../components/Button.jsx";
import { Card } from "../components/Card.jsx";
import { EmptyState } from "../components/EmptyState.jsx";
import { Input } from "../components/Input.jsx";
import { PageHeader } from "../components/PageHeader.jsx";
import { Select } from "../components/Select.jsx";
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
    {requestError && <Alert><span>{requestError}</span></Alert>}
    {Object.keys(errors).length > 0 && <Alert><div><strong>Revisa los campos marcados.</strong><ul>{Object.entries(errors).map(([field, message]) => <li key={field}>{message}</li>)}</ul></div></Alert>}
    <Card>
      <form className="product-form" onSubmit={submit} noValidate>
        <div className="product-form__fields">
          <Input id="product-name" label="Nombre *" value={form.name} onChange={(event) => updateField("name", event.target.value)} minLength="2" maxLength="100" required error={errors.name} />
          <Input id="product-brand" label="Marca *" value={form.brand} onChange={(event) => updateField("brand", event.target.value)} minLength="2" maxLength="50" required error={errors.brand} />
          <label className="field" htmlFor="product-description"><span className="field__label">Descripción *</span><textarea id="product-description" className="field__control" value={form.description} onChange={(event) => updateField("description", event.target.value)} minLength="10" maxLength="1000" required aria-invalid={Boolean(errors.description)} aria-describedby={errors.description ? "product-description-error" : undefined} />{errors.description && <span id="product-description-error" className="field__error">{errors.description}</span>}</label>
          <Input id="product-price" label={`Precio * (${currency})`} type="number" value={form.price} onChange={(event) => updateField("price", event.target.value)} min="0" max="99999999.99" step="0.01" inputMode="decimal" required error={errors.price} />
          <Select id="product-category" label="Categoría *" value={form.categoryId} onChange={(event) => updateField("categoryId", event.target.value)} required error={errors.categoryId}><option value="">Selecciona una categoría</option>{options.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</Select>
          <Input id="product-sku" label="SKU (opcional)" value={form.sku} onChange={(event) => updateField("sku", event.target.value)} maxLength="64" pattern="[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*" placeholder="Se generará automáticamente" hint="Déjalo vacío para generar un SKU automático según la categoría." error={errors.sku} />
        </div>
        <div className="product-form__actions"><Link className="button button--secondary" to="/app/products">Cancelar</Link><Button type="submit" disabled={isSubmitting}>{isSubmitting ? "Creando producto…" : "Crear producto"}</Button></div>
      </form>
    </Card>
  </>;
}
