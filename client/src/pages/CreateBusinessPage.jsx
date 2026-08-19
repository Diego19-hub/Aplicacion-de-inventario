import { ArrowLeft, Building2 } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";

import { Alert } from "../components/Alert.jsx";
import { Button } from "../components/Button.jsx";
import { Card } from "../components/Card.jsx";
import { Input } from "../components/Input.jsx";
import { PageHeader } from "../components/PageHeader.jsx";
import { Select } from "../components/Select.jsx";
import { useAuth } from "../context/AuthContext.jsx";

const timezones = [
  "America/Mexico_City",
  "America/Tijuana",
  "America/Monterrey",
  "America/Cancun",
  "UTC"
];

const initialForm = {
  name: "",
  slug: "",
  legalName: "",
  taxId: "",
  currency: "MXN",
  timezone: "America/Mexico_City"
};

function fieldErrors(fields = []) {
  return Object.fromEntries(fields.map((field) => [field.field, field.message]));
}

function slugFromName(name) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

export function CreateBusinessPage() {
  const navigate = useNavigate();
  const { createBusiness, logout } = useAuth();
  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState({});
  const [requestError, setRequestError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [slugEdited, setSlugEdited] = useState(false);

  function update(field, value) {
    setForm((current) => {
      const next = { ...current, [field]: value };

      if (field === "name" && !slugEdited) {
        next.slug = slugFromName(value);
      }

      return next;
    });
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
      await createBusiness(form);
      navigate("/app", { replace: true });
    } catch (error) {
      setErrors(fieldErrors(error.fields));
      setRequestError(error.message || "No fue posible crear el negocio.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <main className="selection-page">
      <div className="selection-page__content">
        <Link to="/select-business" className="back-link">
          <ArrowLeft aria-hidden="true" />
          Volver a selección
        </Link>
        <PageHeader
          title="Crea tu negocio"
          description="Configura tu espacio de inventario. Serás la persona propietaria y podrás invitar a tu equipo después."
        />
        <Card>
          <div className="stack">
            <div className="auth-card__icon" aria-hidden="true">
              <Building2 />
            </div>
            {requestError && <Alert>{requestError}</Alert>}
            <form className="form-stack" onSubmit={submit} noValidate>
              <Input
                id="onboarding-business-name"
                label="Nombre comercial"
                value={form.name}
                onChange={(event) => update("name", event.target.value)}
                error={errors.name}
                required
                maxLength="120"
              />
              <Input
                id="onboarding-business-slug"
                label="Slug"
                value={form.slug}
                onChange={(event) => {
                  setSlugEdited(true);
                  update("slug", event.target.value);
                }}
                error={errors.slug}
                hint="Usa minúsculas, números y guiones. Sirve como identificador corto del negocio."
                required
                maxLength="100"
              />
              <Input
                id="onboarding-business-legal-name"
                label="Razón social (opcional)"
                value={form.legalName}
                onChange={(event) => update("legalName", event.target.value)}
                error={errors.legalName}
                maxLength="255"
              />
              <Input
                id="onboarding-business-tax-id"
                label="Identificación fiscal (opcional)"
                value={form.taxId}
                onChange={(event) => update("taxId", event.target.value)}
                error={errors.taxId}
                maxLength="100"
              />
              <Input
                id="onboarding-business-currency"
                label="Moneda"
                value={form.currency}
                onChange={(event) => update("currency", event.target.value)}
                error={errors.currency}
                required
                minLength="3"
                maxLength="3"
              />
              <Select
                id="onboarding-business-timezone"
                label="Zona horaria"
                value={form.timezone}
                onChange={(event) => update("timezone", event.target.value)}
                error={errors.timezone}
                required
              >
                {timezones.map((timezone) => (
                  <option key={timezone} value={timezone}>
                    {timezone}
                  </option>
                ))}
              </Select>
              <div className="form-actions">
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? "Creando…" : "Crear negocio"}
                </Button>
                <Link className="button button--secondary" to="/select-business">
                  Cancelar
                </Link>
                <Button variant="ghost" onClick={handleLogout} disabled={isSubmitting}>
                  Cerrar sesión
                </Button>
              </div>
            </form>
          </div>
        </Card>
      </div>
    </main>
  );
}
