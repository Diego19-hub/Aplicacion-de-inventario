import { Link } from "react-router-dom";

import { Alert } from "./Alert.jsx";
import { Button } from "./Button.jsx";
import { Input } from "./Input.jsx";
import { Select } from "./Select.jsx";

export function LocationForm({
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
  const notesError = errors.notes;

  return <form className="product-form" onSubmit={onSubmit} noValidate>
    {(requestError || errorList.length > 0) && <Alert><div className="error-summary" role="alert"><strong>Revisa la información de la ubicación.</strong>{requestError && <p>{requestError}</p>}{errorList.length > 0 && <ul>{errorList.map((error, index) => <li key={`${error}-${index}`}>{error}</li>)}</ul>}</div></Alert>}
    <Input id="location-name" label="Nombre *" value={form.name} onChange={(event) => onChange("name", event.target.value)} minLength="2" maxLength="120" required error={errors.name} />
    <Input id="location-code" label="Código *" value={form.code} onChange={(event) => onChange("code", event.target.value)} minLength="2" maxLength="30" required hint="Se guardará en mayúsculas." error={errors.code} />
    <Select id="location-type" label="Tipo *" value={form.locationType} onChange={(event) => onChange("locationType", event.target.value)} required error={errors.locationType}>
      <option value="branch">Sucursal</option>
      <option value="warehouse">Bodega</option>
    </Select>
    <Input id="location-address" label="Dirección (opcional)" value={form.address} onChange={(event) => onChange("address", event.target.value)} maxLength="500" error={errors.address} />
    <Input id="location-phone" label="Teléfono (opcional)" value={form.phone} onChange={(event) => onChange("phone", event.target.value)} maxLength="40" error={errors.phone} />
    <label className="field" htmlFor="location-notes"><span className="field__label">Notas (opcional)</span><textarea id="location-notes" className="field__control" value={form.notes} onChange={(event) => onChange("notes", event.target.value)} maxLength="1000" aria-invalid={Boolean(notesError)} aria-describedby={notesError ? "location-notes-error" : undefined} />{notesError && <span id="location-notes-error" className="field__error">{notesError}</span>}</label>
    <div className="product-form__actions"><Link className="button button--secondary" to={cancelTo}>Cancelar</Link><Button type="submit" disabled={isSubmitting}>{isSubmitting ? "Guardando ubicación…" : submitLabel}</Button></div>
  </form>;
}
