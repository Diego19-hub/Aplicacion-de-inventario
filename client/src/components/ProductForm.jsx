import { Link } from "react-router-dom";

import { Alert } from "./Alert.jsx";
import { Button } from "./Button.jsx";
import { Input } from "./Input.jsx";
import { Select } from "./Select.jsx";

export function ProductForm({
  mode,
  form,
  categories,
  currency,
  errors,
  summaryError,
  isSubmitting,
  cancelTo,
  onChange,
  onSubmit
}) {
  const isEditing = mode === "edit";
  const hasErrors = Object.keys(errors).length > 0;
  const submitLabel = isEditing ? "Guardar cambios" : "Crear producto";
  const submittingLabel = isEditing ? "Guardando cambios…" : "Creando producto…";
  const selectableCategories = categories.filter((category) => !category.isDefault);

  return <form className="product-form" onSubmit={onSubmit} noValidate>
    {summaryError && <Alert><span>{summaryError}</span></Alert>}
    {hasErrors && <Alert><div><strong>Revisa los campos marcados.</strong><ul>{Object.entries(errors).map(([field, message]) => <li key={field}>{message}</li>)}</ul></div></Alert>}
    <div className="product-form__fields">
      <Input id="product-name" label="Nombre *" value={form.name} onChange={(event) => onChange("name", event.target.value)} minLength="2" maxLength="100" required error={errors.name} />
      <Input id="product-brand" label="Marca *" value={form.brand} onChange={(event) => onChange("brand", event.target.value)} minLength="2" maxLength="50" required error={errors.brand} />
      <label className="field" htmlFor="product-description"><span className="field__label">Descripción{isEditing ? " (opcional)" : " *"}</span><textarea id="product-description" className="field__control" value={form.description} onChange={(event) => onChange("description", event.target.value)} minLength={isEditing ? undefined : "10"} maxLength="1000" required={!isEditing} aria-invalid={Boolean(errors.description)} aria-describedby={errors.description ? "product-description-error" : undefined} />{errors.description && <span id="product-description-error" className="field__error">{errors.description}</span>}</label>
      <Input id="product-price" label={`Precio * (${currency})`} type="number" value={form.price} onChange={(event) => onChange("price", event.target.value)} min="0" max="99999999.99" step="0.01" inputMode="decimal" required error={errors.price} />
      <Input id="product-cost-price" label={`Costo de adquisición (${currency})`} type="number" value={form.costPrice ?? ""} onChange={(event) => onChange("costPrice", event.target.value)} min="0" max="9999999999.99" step="0.01" inputMode="decimal" hint="Opcional. Usa el costo unitario de compra del producto." error={errors.costPrice} />
      {form.price !== "" && form.costPrice !== "" && Number(form.costPrice) >= 0 && <p className="product-form__margin">Margen estimado: <strong>{new Intl.NumberFormat("es-MX", { style: "currency", currency }).format(Number(form.price) - Number(form.costPrice))}</strong> por unidad</p>}
      <Select id="product-category" label="Categoría (opcional)" value={form.categoryId} onChange={(event) => onChange("categoryId", event.target.value)} error={errors.categoryId} hint="Si no eliges una categoría, se usará Sin categoría."><option value="">Sin categoría</option>{selectableCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</Select>
      <Input id="product-sku" label={isEditing ? "SKU *" : "SKU (opcional)"} value={form.sku} onChange={(event) => onChange("sku", event.target.value)} maxLength="64" pattern="[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*" placeholder={isEditing ? "SKU del producto" : "Se generará automáticamente"} hint={isEditing ? "Puedes actualizar el SKU usando letras, números y guiones simples." : "Déjalo vacío para generar un SKU automático según la categoría."} required={isEditing} error={errors.sku} />
      <Input id="product-barcode" label="Código de barras (opcional)" value={form.barcode ?? ""} onChange={(event) => onChange("barcode", event.target.value)} inputMode="numeric" maxLength="14" hint="Entre 8 y 14 dígitos; se conservan los ceros iniciales." error={errors.barcode} />
    </div>
    <div className="product-form__actions"><Link className="button button--secondary" to={cancelTo}>Cancelar</Link><Button type="submit" disabled={isSubmitting}>{isSubmitting ? submittingLabel : submitLabel}</Button></div>
  </form>;
}
