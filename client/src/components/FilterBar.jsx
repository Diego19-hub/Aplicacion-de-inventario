import { Button } from "./Button.jsx";
import { Card } from "./Card.jsx";

export function FilterBar({ children, onSubmit, onClear, loading = false, clearLabel = "Limpiar" }) {
  function submit(event) {
    event.preventDefault();
    event.stopPropagation();
    onSubmit?.(event);
  }

  function handleKeyDown(event) {
    if (event.key !== "Enter") return;

    event.preventDefault();
    event.stopPropagation();
    onSubmit?.(event);
  }

  return <Card className="filter-bar"><form onSubmit={submit} onKeyDown={handleKeyDown}>{children}<div className="filter-bar__actions"><Button type="submit" disabled={loading}>{loading ? "Aplicando…" : "Aplicar"}</Button>{onClear && <Button type="button" variant="secondary" onClick={onClear} disabled={loading}>{clearLabel}</Button>}</div></form></Card>;
}
