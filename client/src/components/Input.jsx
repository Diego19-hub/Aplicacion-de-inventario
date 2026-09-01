export function Input({ id, label, error, hint, integerOnly = false, min, onChange, type, step, inputMode, ...props }) {
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
  const integerQuantity = integerOnly || (type === "number" && (step === "1" || inputMode === "numeric" || Number(min) >= 1));

  function handleChange(event) {
    const value = event.target.value;
    if (integerQuantity && value && (!/^\d+$/.test(value) || (min !== undefined && Number(value) < Number(min)))) return;
    onChange?.(event);
  }

  return (
    <label className="field" htmlFor={id}>
      <span className="field__label">{label}</span>
      <input id={id} className="field__control" type={type} min={min} step={integerQuantity ? "1" : step} inputMode={integerQuantity ? "numeric" : inputMode} aria-invalid={Boolean(error)} aria-describedby={describedBy} {...props} onChange={handleChange} />
      {hint && <span id={`${id}-hint`} className="field__hint">{hint}</span>}
      {error && <span id={`${id}-error`} className="field__error">{error}</span>}
    </label>
  );
}
