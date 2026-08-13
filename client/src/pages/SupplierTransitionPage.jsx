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
import { useAuth } from "../context/AuthContext.jsx";

const copy = {
  deactivate: {
    title: "Desactivar proveedor",
    action: "Desactivar proveedor",
    state: "activo",
    confirmation: "Confirmo que deseo desactivar este proveedor.",
    consequence: "Su información se conservará, pero dejará de aparecer de forma predeterminada entre los proveedores activos."
  },
  reactivate: {
    title: "Reactivar proveedor",
    action: "Reactivar proveedor",
    state: "inactivo",
    confirmation: "Confirmo que deseo reactivar este proveedor.",
    consequence: "El proveedor volverá a aparecer entre los proveedores activos."
  }
};

export function SupplierTransitionPage({ action }) {
  const { supplierId } = useParams();
  const { session } = useAuth();
  const navigate = useNavigate();
  const [supplier, setSupplier] = useState(null);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [requestError, setRequestError] = useState("");
  const content = copy[action];

  const loadSupplier = useCallback(async () => {
    if (!session.permissions.canManageInventory) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setLoadError(null);
    try {
      const response = await apiRequest(`/suppliers/${supplierId}`);
      setSupplier(response.supplier);
    } catch (error) {
      setLoadError(error);
    } finally {
      setIsLoading(false);
    }
  }, [session.permissions.canManageInventory, supplierId]);

  useEffect(() => {
    loadSupplier();
  }, [loadSupplier]);

  async function submit(event) {
    event.preventDefault();
    if (!isConfirmed || isSubmitting) return;

    setIsSubmitting(true);
    setRequestError("");
    try {
      await apiRequest(`/suppliers/${supplierId}/${action}`, { method: "POST", csrf: true });
      navigate(`/app/suppliers/${supplierId}`);
    } catch (error) {
      setRequestError(error.message || `No fue posible ${action === "deactivate" ? "desactivar" : "reactivar"} el proveedor.`);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!session.permissions.canManageInventory) {
    return <EmptyState title="Acceso restringido" description="Solo owner y manager pueden cambiar el estado de proveedores." action={<Link className="button button--secondary" to={`/app/suppliers/${supplierId}`}>Volver al proveedor</Link>} />;
  }
  if (isLoading) return <section className="dashboard-state"><Spinner label="Cargando proveedor" /></section>;
  if (loadError?.code === "SUPPLIER_NOT_FOUND" || loadError?.code === "VALIDATION_ERROR") return <EmptyState title="Proveedor no encontrado" description="El proveedor no está disponible en el negocio activo." action={<Link className="button button--secondary" to="/app/suppliers">Volver a proveedores</Link>} />;
  if (loadError) return <Alert><div className="dashboard-error"><span>No fue posible cargar el proveedor.</span><Button variant="secondary" onClick={loadSupplier}>Reintentar</Button></div></Alert>;
  if (supplier.status !== content.state) return <EmptyState title="Estado actualizado" description="El proveedor ya no requiere esta transición." action={<Link className="button button--secondary" to={`/app/suppliers/${supplierId}`}>Volver al proveedor</Link>} />;

  return (
    <>
      <Link to={`/app/suppliers/${supplierId}`} className="back-link"><ArrowLeft aria-hidden="true" />Volver al proveedor</Link>
      <PageHeader title={content.title} description="Esta acción cambia la disponibilidad del proveedor, no elimina su información." />
      <Card>
        <dl className="detail-list">
          <div><dt>Proveedor</dt><dd>{supplier.name}</dd></div>
          {supplier.legalName && <div><dt>Razón social</dt><dd>{supplier.legalName}</dd></div>}
          <div><dt>Estado actual</dt><dd>{supplier.status === "active" ? "Activo" : "Inactivo"}</dd></div>
          <div><dt>Acción</dt><dd>{content.action}</dd></div>
        </dl>
        <p>{content.consequence}</p>
        {requestError && <Alert><p>{requestError}</p></Alert>}
        <form className="product-form" onSubmit={submit}>
          <label className="field" htmlFor="supplier-transition-confirmation">
            <span className="field__label">
              <input
                id="supplier-transition-confirmation"
                type="checkbox"
                checked={isConfirmed}
                onChange={(event) => setIsConfirmed(event.target.checked)}
              />
              {content.confirmation}
            </span>
          </label>
          <div className="product-form__actions">
            <Link className="button button--secondary" to={`/app/suppliers/${supplierId}`}>Cancelar</Link>
            <Button type="submit" variant={action === "deactivate" ? "danger" : "primary"} disabled={!isConfirmed || isSubmitting}>
              {isSubmitting ? "Guardando…" : content.action}
            </Button>
          </div>
        </form>
      </Card>
    </>
  );
}
