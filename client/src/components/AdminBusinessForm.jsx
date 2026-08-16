import { Alert } from "./Alert.jsx";
import { Button } from "./Button.jsx";
import { Input } from "./Input.jsx";
import { Select } from "./Select.jsx";
import { Link } from "react-router-dom";

const timezones = [
  "America/Mexico_City",
  "America/Tijuana",
  "America/Monterrey",
  "America/Cancun",
  "UTC"
];

export function AdminBusinessForm({
  form,
  owners = [],
  errors,
  requestError,
  isCreate,
  isSubmitting,
  submitLabel,
  cancelTo,
  onChange,
  onSubmit
}) {
  return <form className="form-stack" onSubmit={onSubmit} noValidate>
    {requestError && <Alert>{requestError}</Alert>}
    <Input id="business-name" label="Nombre comercial" value={form.name} onChange={(event) => onChange("name", event.target.value)} error={errors.name} required maxLength="120" />
    <Input id="business-slug" label="Slug" value={form.slug} onChange={(event) => onChange("slug", event.target.value)} error={errors.slug} hint="Usa minúsculas, números y guiones." required maxLength="100" />
    {isCreate && <Select id="business-owner" label="Persona propietaria" value={form.ownerUserId} onChange={(event) => onChange("ownerUserId", event.target.value)} error={errors.ownerUserId} required><option value="">Selecciona una persona</option>{owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.username} · {owner.email}</option>)}</Select>}
    <Input id="business-legal-name" label="Razón social (opcional)" value={form.legalName} onChange={(event) => onChange("legalName", event.target.value)} error={errors.legalName} maxLength="255" />
    <Input id="business-tax-id" label="Identificación fiscal (opcional)" value={form.taxId} onChange={(event) => onChange("taxId", event.target.value)} error={errors.taxId} maxLength="100" />
    <Input id="business-currency" label="Moneda" value={form.currency} onChange={(event) => onChange("currency", event.target.value)} error={errors.currency} required minLength="3" maxLength="3" />
    <Select id="business-timezone" label="Zona horaria" value={form.timezone} onChange={(event) => onChange("timezone", event.target.value)} error={errors.timezone} required>{timezones.map((timezone) => <option key={timezone} value={timezone}>{timezone}</option>)}</Select>
    <div className="form-actions"><Button type="submit" disabled={isSubmitting}>{isSubmitting ? "Guardando…" : submitLabel}</Button><Link className="button button--secondary" to={cancelTo}>Cancelar</Link></div>
  </form>;
}
