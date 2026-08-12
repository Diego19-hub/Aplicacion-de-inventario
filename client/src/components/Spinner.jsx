export function Spinner({ label = "Cargando" }) {
  return <span className="spinner" role="status"><span className="spinner__icon" aria-hidden="true" /><span>{label}</span></span>;
}
