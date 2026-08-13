import { Input } from "./Input.jsx";
import { Alert } from "./Alert.jsx";
import { Button } from "./Button.jsx";
import { Link } from "react-router-dom";

export function CategoryForm({ form, errors, requestError, isSubmitting, submitLabel, cancelTo, onChange, onSubmit }) {
  return <form className="product-form" onSubmit={onSubmit} noValidate>
    {requestError && <Alert><span>{requestError}</span></Alert>}
    {Object.keys(errors).length > 0 && <Alert><div><strong>Revisa los campos marcados.</strong><ul>{Object.entries(errors).map(([field, message]) => <li key={field}>{message}</li>)}</ul></div></Alert>}
    <div className="product-form__fields">
      <Input id="category-name" label="Nombre *" value={form.name} onChange={(event) => onChange("name", event.target.value)} minLength="2" maxLength="50" error={errors.name} required />
      <label className="field" htmlFor="category-description"><span className="field__label">Descripción (opcional)</span><textarea id="category-description" className="field__control" value={form.description} onChange={(event) => onChange("description", event.target.value)} maxLength="500" aria-invalid={Boolean(errors.description)} aria-describedby={errors.description ? "category-description-error" : undefined} />{errors.description && <span id="category-description-error" className="field__error">{errors.description}</span>}</label>
    </div>
    <div className="product-form__actions"><Link className="button button--secondary" to={cancelTo}>Cancelar</Link><Button type="submit" disabled={isSubmitting}>{isSubmitting ? "Guardando categoría…" : submitLabel}</Button></div>
  </form>;
}
