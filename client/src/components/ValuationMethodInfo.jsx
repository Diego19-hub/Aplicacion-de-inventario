import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { apiRequest } from "../api/client.js";
import { Card } from "./Card.jsx";
import { useAuth } from "../context/AuthContext.jsx";

const valuationLabels = { average: "Promedio", fifo: "PEPS/FIFO" };

export function ValuationMethodInfo({ card = false, showLink = false }) {
  const { session } = useAuth();
  const businessId = session.activeBusiness?.id;
  const [state, setState] = useState({ method: null, loading: Boolean(businessId), error: false });

  useEffect(() => {
    let active = true;
    if (!businessId) {
      setState({ method: null, loading: false, error: false });
      return () => { active = false; };
    }

    setState({ method: null, loading: true, error: false });
    apiRequest("/business/settings/valuation")
      .then((data) => {
        if (active) setState({ method: data?.valuationMethod ?? null, loading: false, error: false });
      })
      .catch(() => {
        if (active) setState({ method: null, loading: false, error: true });
      });

    return () => { active = false; };
  }, [businessId]);

  const content = state.loading
    ? <span className="muted" role="status">Consultando método de valuación…</span>
    : state.error || !state.method
      ? <span className="muted" role="status">Método de valuación no disponible.</span>
      : <span>Método de valuación actual: <strong>{valuationLabels[state.method] ?? state.method}</strong></span>;

  if (card) {
    return <Card className="valuation-method-card">
      <div className="valuation-method-card__content">
        <p className="eyebrow">Valuación del inventario</p>
        {content}
      </div>
      {showLink && <Link className="text-link" to="/app/settings">Configurar método</Link>}
    </Card>;
  }

  return <p className="valuation-method-info" aria-label="Método de valuación">{content}</p>;
}
