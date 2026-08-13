import { AlertTriangle, ArrowLeft } from "lucide-react";
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

export function ArchiveProductPage() {
  const { productId } = useParams();
  const { session } = useAuth();
  const navigate = useNavigate();
  const [product, setProduct] = useState(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const loadProduct = useCallback(async () => {
    if (!session.permissions.canDeleteInventory) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError("");
    setNotFound(false);
    try {
      const data = await apiRequest(`/products/${productId}`);
      setProduct(data.product);
    } catch (requestError) {
      if (requestError.code === "PRODUCT_NOT_FOUND") setNotFound(true);
      else setError(requestError.message || "No fue posible cargar el producto.");
    } finally {
      setIsLoading(false);
    }
  }, [productId, session.permissions.canDeleteInventory]);

  useEffect(() => { loadProduct(); }, [loadProduct]);

  async function submit(event) {
    event.preventDefault();
    if (isSubmitting || !confirmed) return;

    setIsSubmitting(true);
    setError("");
    try {
      await apiRequest(`/products/${productId}/archive`, {
        method: "POST",
        body: { reason },
        csrf: true
      });
      navigate("/app/products");
    } catch (requestError) {
      if (requestError.code === "PRODUCT_NOT_FOUND") {
        setNotFound(true);
      } else {
        setError(requestError.message || "No fue posible archivar el producto.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!session.permissions.canDeleteInventory) {
    return <EmptyState title="Acceso restringido" description="Solo la persona propietaria puede archivar productos." action={<Link className="button button--secondary" to={`/app/products/${productId}`}>Volver al producto</Link>} />;
  }

  if (isLoading) return <section className="dashboard-state"><Spinner label="Cargando producto" /></section>;
  if (notFound) return <EmptyState title="Producto no disponible" description="El producto fue archivado o ya no está disponible en el negocio activo." action={<Link className="button button--secondary" to="/app/products">Volver a productos</Link>} />;
  if (error && !product) return <Alert><div className="dashboard-error"><span>{error}</span><Button variant="secondary" onClick={loadProduct}>Reintentar</Button></div></Alert>;

  return <section className="archive-product-page">
    <Link to={`/app/products/${productId}`} className="back-link"><ArrowLeft aria-hidden="true" />Volver al producto</Link>
    <PageHeader title="Archivar producto" description="Esta acción retira el producto de los listados activos." />
    <Card className="archive-product-card">
      <div><p className="eyebrow">Producto seleccionado</p><h2>{product.name}</h2><p className="muted">SKU: {product.sku}</p></div>
      <div className="archive-warning" role="note"><strong><AlertTriangle aria-hidden="true" /> Acción de archivado</strong><p>El producto dejará de aparecer en listados activos. Sus movimientos y existencias se conservarán; no se eliminará información.</p></div>
      {error && <Alert><span>{error}</span></Alert>}
      <form className="product-form" onSubmit={submit} noValidate>
        <label className="field" htmlFor="archive-reason"><span className="field__label">Motivo de archivado *</span><textarea id="archive-reason" className="field__control" value={reason} onChange={(event) => setReason(event.target.value)} minLength="5" maxLength="500" required aria-invalid={Boolean(error)} aria-describedby={error ? "archive-reason-error" : undefined} />{error && <span id="archive-reason-error" className="field__error">{error}</span>}</label>
        <label className="archive-confirmation" htmlFor="archive-confirmation"><input id="archive-confirmation" type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span>Confirmo que quiero archivar este producto y entiendo que ya no aparecerá entre los activos.</span></label>
        <div className="product-form__actions"><Link className="button button--secondary" to={`/app/products/${productId}`}>Cancelar</Link><Button type="submit" variant="danger" disabled={isSubmitting || !confirmed}>{isSubmitting ? "Archivando producto…" : "Archivar producto"}</Button></div>
      </form>
    </Card>
  </section>;
}
