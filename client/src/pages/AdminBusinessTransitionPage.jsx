import { ArrowLeft } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { apiRequest } from "../api/client.js";
import { Alert } from "../components/Alert.jsx";
import { Button } from "../components/Button.jsx";
import { Card } from "../components/Card.jsx";
import { EmptyState } from "../components/EmptyState.jsx";
import { PageHeader } from "../components/PageHeader.jsx";
import { Spinner } from "../components/Spinner.jsx";

const actions = {
  suspend: {
    title: "Suspender negocio",
    submitLabel: "Suspender negocio",
    warning: "Las personas con membresías ya no podrán usar este negocio como negocio activo hasta que se reactive.",
    buttonVariant: "secondary"
  },
  reactivate: {
    title: "Reactivar negocio",
    submitLabel: "Reactivar negocio",
    warning: "El negocio volverá a estar disponible para sus membresías activas. No se seleccionará automáticamente en ninguna sesión.",
    buttonVariant: "primary"
  },
  archive: {
    title: "Archivar negocio",
    submitLabel: "Archivar negocio",
    warning: "El archivado impide que el negocio se use como activo. Sus productos, ubicaciones y registros se conservan y esta acción no tiene restauración en esta pantalla.",
    buttonVariant: "danger"
  }
};

function statusLabel(status) {
  return { active: "Activo", suspended: "Suspendido", archived: "Archivado" }[status] ?? status;
}

export function AdminBusinessTransitionPage() {
  const { businessId, action } = useParams();
  const navigate = useNavigate();
  const [business, setBusiness] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [confirmed, setConfirmed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const config = actions[action];
  const loadBusiness = useCallback(async () => {
    if (!config) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await apiRequest(`/admin/businesses/${businessId}`);
      setBusiness(data.business);
    } catch (requestError) {
      setError(requestError);
    } finally {
      setIsLoading(false);
    }
  }, [businessId, config]);

  useEffect(() => {
    loadBusiness();
  }, [loadBusiness]);

  async function submit(event) {
    event.preventDefault();
    if (!confirmed || isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await apiRequest(`/admin/businesses/${businessId}/${action}`, { method: "POST", body: {}, csrf: true });
      navigate(`/app/admin/businesses/${businessId}`);
    } catch (requestError) {
      setError(requestError);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!config) return <EmptyState title="Acción no disponible" description="La transición solicitada no existe." action={<Link className="button button--secondary" to={`/app/admin/businesses/${businessId}`}>Volver al negocio</Link>} />;
  if (isLoading) return <section className="dashboard-state"><Spinner label="Cargando negocio" /></section>;
  if (error?.code === "BUSINESS_NOT_FOUND" || error?.code === "VALIDATION_ERROR") return <EmptyState title="Negocio no encontrado" description="No hay un negocio disponible con ese identificador." action={<Link className="button button--secondary" to="/app/admin/businesses">Volver a negocios</Link>} />;

  return <>
    <Link to={`/app/admin/businesses/${businessId}`} className="back-link"><ArrowLeft aria-hidden="true" />Volver al negocio</Link>
    <PageHeader title={config.title} description="Confirma la transición antes de continuar." />
    <Card>
      <dl className="detail-list"><div><dt>Negocio</dt><dd>{business.name}</dd></div><div><dt>Slug</dt><dd>{business.slug}</dd></div><div><dt>Estado actual</dt><dd>{statusLabel(business.status)}</dd></div></dl>
      <Alert variant={action === "archive" ? "error" : "warning"}>{config.warning}</Alert>
      {error && <Alert>{error.message || "No fue posible completar la transición."}</Alert>}
      <form className="form-stack" onSubmit={submit}>
        <label className="field" htmlFor="admin-transition-confirmation"><span className="field__label"><input id="admin-transition-confirmation" type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /> Confirmo que deseo {config.submitLabel.toLowerCase()}.</span></label>
        <div className="form-actions"><Button type="submit" variant={config.buttonVariant} disabled={!confirmed || isSubmitting}>{isSubmitting ? "Guardando…" : config.submitLabel}</Button><Link className="button button--secondary" to={`/app/admin/businesses/${businessId}`}>Cancelar</Link></div>
      </form>
    </Card>
  </>;
}
