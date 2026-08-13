import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { apiRequest } from "../api/client.js";
import { Card } from "../components/Card.jsx";
import { EmptyState } from "../components/EmptyState.jsx";
import { PageHeader } from "../components/PageHeader.jsx";
import { SupplierForm } from "../components/SupplierForm.jsx";
import { useAuth } from "../context/AuthContext.jsx";

const initialForm = {
  name: "",
  legalName: "",
  taxId: "",
  contactName: "",
  email: "",
  phone: "",
  address: "",
  notes: ""
};

function errorsByField(fields = []) {
  return Object.fromEntries(fields.map((field) => [field.field, field.message]));
}

export function NewSupplierPage() {
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
      const response = await apiRequest("/suppliers", { method: "POST", body: form, csrf: true });
      navigate(`/app/suppliers/${response.supplier.id}`);
    } catch (error) {
      setErrors(errorsByField(error.fields));
      setRequestError(error.message || "No fue posible crear el proveedor.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!session.permissions.canManageInventory) {
    return <EmptyState title="Acceso restringido" description="Solo owner y manager pueden crear proveedores." action={<Link className="button button--secondary" to="/app/suppliers">Volver a proveedores</Link>} />;
  }

  return (
    <>
      <Link to="/app/suppliers" className="back-link"><ArrowLeft aria-hidden="true" />Volver a proveedores</Link>
      <PageHeader title="Crear proveedor" description="Registra los datos comerciales y de contacto." />
      <Card><SupplierForm form={form} errors={errors} requestError={requestError} isSubmitting={isSubmitting} submitLabel="Crear proveedor" cancelTo="/app/suppliers" onChange={update} onSubmit={submit} /></Card>
    </>
  );
}
