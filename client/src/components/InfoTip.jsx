import { Info } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

export function InfoTip({ title, content }) {
  const [isOpen, setIsOpen] = useState(false);
  const id = useId();
  const infoTipRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;

    function handlePointerDown(event) {
      if (!infoTipRef.current?.contains(event.target)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  return <span ref={infoTipRef} className="info-tip">
    <button type="button" className="info-tip__button" aria-label={`Más información: ${title}`} aria-expanded={isOpen} aria-controls={id} onClick={() => setIsOpen((open) => !open)}>
      <Info aria-hidden="true" />
    </button>
    {isOpen && <span id={id} className="info-tip__content" role="region"><strong>{title}</strong><span>{content}</span></span>}
  </span>;
}
