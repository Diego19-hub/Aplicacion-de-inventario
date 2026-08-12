export function Alert({ children, variant = "error" }) {
  return <div className={`alert alert--${variant}`} role="alert">{children}</div>;
}
