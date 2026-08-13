import { Link } from "react-router-dom";

import { Alert } from "./Alert.jsx";
import { Button } from "./Button.jsx";
import { Input } from "./Input.jsx";

function TextAreaField({ id, label, value, error, maxLength, onChange }) {
  const describedBy = error ? `${id}-error` : undefined;

  return (
    <label className="field" htmlFor={id}>
      <span className="field__label">{label}</span>
      <textarea
        id={id}
        className="field__control"
        value={value}
        maxLength={maxLength}
        onChange={onChange}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy}
      />
      {error && <span id={`${id}-error`} className="field__error">{error}</span>}
    </label>
  );
}

export function SupplierForm({
  form,
  errors,
  requestError,
  isSubmitting,
  submitLabel,
  cancelTo,
  onChange,
  onSubmit
}) {
  const errorList = Object.values(errors);

  return (
    <form className="product-form" onSubmit={onSubmit} noValidate>
      {(requestError || errorList.length > 0) && (
        <Alert>
          <div className="error-summary" role="alert">
            <strong>Revisa la información del proveedor.</strong>
            {requestError && <p>{requestError}</p>}
            {errorList.length > 0 && (
              <ul>
                {errorList.map((error, index) => <li key={`${error}-${index}`}>{error}</li>)}
              </ul>
            )}
          </div>
        </Alert>
      )}

      <Input
        id="supplier-name"
        label="Nombre comercial *"
        value={form.name}
        onChange={(event) => onChange("name", event.target.value)}
        minLength="2"
        maxLength="120"
        required
        error={errors.name}
      />
      <Input
        id="supplier-legal-name"
        label="Razón social (opcional)"
        value={form.legalName}
        onChange={(event) => onChange("legalName", event.target.value)}
        maxLength="255"
        error={errors.legalName}
      />
      <Input
        id="supplier-tax-id"
        label="RFC o identificación fiscal (opcional)"
        value={form.taxId}
        onChange={(event) => onChange("taxId", event.target.value)}
        maxLength="40"
        hint="Se guardará en mayúsculas."
        error={errors.taxId}
      />
      <Input
        id="supplier-contact-name"
        label="Contacto (opcional)"
        value={form.contactName}
        onChange={(event) => onChange("contactName", event.target.value)}
        maxLength="120"
        error={errors.contactName}
      />
      <Input
        id="supplier-email"
        label="Correo (opcional)"
        type="email"
        value={form.email}
        onChange={(event) => onChange("email", event.target.value)}
        maxLength="254"
        hint="Se guardará en minúsculas."
        error={errors.email}
      />
      <Input
        id="supplier-phone"
        label="Teléfono (opcional)"
        value={form.phone}
        onChange={(event) => onChange("phone", event.target.value)}
        maxLength="40"
        error={errors.phone}
      />
      <TextAreaField
        id="supplier-address"
        label="Dirección (opcional)"
        value={form.address}
        maxLength="500"
        onChange={(event) => onChange("address", event.target.value)}
        error={errors.address}
      />
      <TextAreaField
        id="supplier-notes"
        label="Notas (opcional)"
        value={form.notes}
        maxLength="1000"
        onChange={(event) => onChange("notes", event.target.value)}
        error={errors.notes}
      />

      <div className="product-form__actions">
        <Link className="button button--secondary" to={cancelTo}>Cancelar</Link>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Guardando proveedor…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
