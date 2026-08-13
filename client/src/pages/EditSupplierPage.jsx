import { ArrowLeft } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { apiRequest } from "../api/client.js";
import { Alert } from "../components/Alert.jsx";
import { Button } from "../components/Button.jsx";
import { Card } from "../components/Card.jsx";
import { EmptyState } from "../components/EmptyState.jsx";
import { PageHeader } from "../components/PageHeader.jsx";
import { Spinner } from "../components/Spinner.jsx";
import { SupplierForm } from "../components/SupplierForm.jsx";
import { useAuth } from "../context/AuthContext.jsx";

function errorsByField(fields = []) {
  return Object.fromEntries(fields.map((field) => [field.field, field.message]));
}

export function EditSupplierPage() {
  const { supplierId } = useParams();
  const { session } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState(null);
  const [errors, setErrors] = useState({});
  const [requestError, setRequestError] = useState("");
  const [loadError, setLoadError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadSupplier = useCallback(async () => {
    if (!session.permissions.canManageInventory) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setLoadError(null);
    try {
      const response = await apiRequest(`/suppliers/${supplierId}/edit`);
      setForm({
        name: response.supplier.name,
        legalName: response.supplier.legalName || "",
        taxId: response.supplier.taxId || "",
        contactName: response.supplier.contactName || "",
        email: response.supplier.email || "",
        phone: response.supplier.phone || "",
        address: response.supplier.address || "",
        notes: response.supplier.notes || ""
      });
    } catch (error) {
      setLoadError(error);
    } finally {
      setIsLoading(false);
    }
  }, [session.permissions.canManageInventory, supplierId]);

  useEffect(() => {
    loadSupplier();
  }, [loadSupplier]);

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
      const response = await apiRequest(`/suppliers/${supplierId}`, { method: "PUT", body: form, csrf: true });
      navigate(`/app/suppliers/${response.supplier.id}`);
    } catch (error) {
      setErrors(errorsByField(error.fields));
      setRequestError(error.message || "No fue posible actualizar el proveedor.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!session.permissions.canManageInventory) {
    return <EmptyState title="Acceso restringido" description="Solo owner y manager pueden editar proveedores." action={<Link className="button button--secondary" to={`/app/suppliers/${supplierId}`}>Volver al proveedor</Link>} />;
  }
  if (isLoading) return <section className="dashboard-state"><Spinner label="Cargando proveedor" /></section>;
  if (loadError?.code === "SUPPLIER_NOT_FOUND" || loadError?.code === "VALIDATION_ERROR") return <EmptyState title="Proveedor no encontrado" description="El proveedor no está disponible en el negocio activo." action={<Link className="button button--secondary" to="/app/suppliers">Volver a proveedores</Link>} />;
  if (loadError) return <Alert><div className="dashboard-error"><span>No fue posible cargar el proveedor.</span><Button variant="secondary" onClick={loadSupplier}>Reintentar</Button></div></Alert>;

  return (
    <>
      <Link to={`/app/suppliers/${supplierId}`} className="back-link"><ArrowLeft aria-hidden="true" />Volver al proveedor</Link>
      <PageHeader title="Editar proveedor" description="Actualiza sus datos comerciales y de contacto." />
      <Card><SupplierForm form={form} errors={errors} requestError={requestError} isSubmitting={isSubmitting} submitLabel="Guardar cambios" cancelTo={`/app/suppliers/${supplierId}`} onChange={update} onSubmit={submit} /></Card>
    </>
  );
}
