import { Grid2X2, List } from "lucide-react";

const VIEW_MODES = new Set(["list", "cards"]);

export function getStoredViewMode(key) {
  const saved = window.localStorage.getItem(key);
  return VIEW_MODES.has(saved) ? saved : "list";
}

export function ViewModeToggle({ value, storageKey, onChange }) {
  function select(mode) {
    if (!VIEW_MODES.has(mode)) return;
    window.localStorage.setItem(storageKey, mode);
    onChange(mode);
  }

  return <div className="product-view-toolbar" aria-label="Selector de vista">
    <span className="product-view-toolbar__label">Vista</span>
    <div className="product-view-toggle" role="group" aria-label="Vista de registros">
      <button type="button" className={`button button--compact ${value === "list" ? "button--primary" : "button--secondary"}`} aria-pressed={value === "list"} onClick={() => select("list")}><List aria-hidden="true" />Lista</button>
      <button type="button" className={`button button--compact ${value === "cards" ? "button--primary" : "button--secondary"}`} aria-pressed={value === "cards"} onClick={() => select("cards")}><Grid2X2 aria-hidden="true" />Tarjetas</button>
    </div>
  </div>;
}
