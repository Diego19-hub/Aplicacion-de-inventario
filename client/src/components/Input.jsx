export function Input({ id, label, error, hint, ...props }) {
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;

  return (
    <label className="field" htmlFor={id}>
      <span className="field__label">{label}</span>
      <input id={id} className="field__control" aria-invalid={Boolean(error)} aria-describedby={describedBy} {...props} />
      {hint && <span id={`${id}-hint`} className="field__hint">{hint}</span>}
      {error && <span id={`${id}-error`} className="field__error">{error}</span>}
    </label>
  );
}
