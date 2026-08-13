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

export function RestoreProductPage() {
  const { productId } = useParams(); const { session } = useAuth(); const navigate = useNavigate();
  const [product, setProduct] = useState(null); const [loading, setLoading] = useState(true); const [error, setError] = useState(""); const [notFound, setNotFound] = useState(false); const [confirmed, setConfirmed] = useState(false); const [submitting, setSubmitting] = useState(false);
  const load = useCallback(async () => { if (!session.permissions.canDeleteInventory) { setLoading(false); return; } setLoading(true); setError(""); try { const data = await apiRequest(`/products/${productId}/archived`); setProduct(data.product); } catch (requestError) { if (requestError.code === "PRODUCT_NOT_FOUND") setNotFound(true); else setError(requestError.message || "No fue posible cargar el producto."); } finally { setLoading(false); } }, [productId, session.permissions.canDeleteInventory]);
  useEffect(() => { load(); }, [load]);
  async function submit(event) { event.preventDefault(); if (!confirmed || submitting) return; setSubmitting(true); setError(""); try { await apiRequest(`/products/${productId}/restore`, { method: "POST", csrf: true }); navigate(`/app/products/${productId}`); } catch (requestError) { if (requestError.code === "PRODUCT_NOT_FOUND") setNotFound(true); else setError(requestError.message || "No fue posible restaurar el producto."); } finally { setSubmitting(false); } }
  if (!session.permissions.canDeleteInventory) return <EmptyState title="Acceso restringido" description="Solo la persona propietaria puede restaurar productos." action={<Link className="button button--secondary" to="/app/products">Volver a productos</Link>} />;
  if (loading) return <section className="dashboard-state"><Spinner label="Cargando producto archivado" /></section>;
  if (notFound) return <EmptyState title="Producto no disponible" description="El producto no está archivado o ya no está disponible en el negocio activo." action={<Link className="button button--secondary" to="/app/products/archived">Volver a archivados</Link>} />;
  if (error && !product) return <Alert><div className="dashboard-error"><span>{error}</span><Button variant="secondary" onClick={load}>Reintentar</Button></div></Alert>;
  return <section className="archive-product-page"><Link to={`/app/products/${productId}/archived`} className="back-link"><ArrowLeft aria-hidden="true" />Volver al producto archivado</Link><PageHeader title="Restaurar producto" description="El producto volverá a los listados activos." /><Card className="archive-product-card"><div><p className="eyebrow">Producto seleccionado</p><h2>{product.name}</h2><p className="muted">SKU: {product.sku}</p></div>{error && <Alert><span>{error}</span></Alert>}<form className="product-form" onSubmit={submit}><label className="archive-confirmation" htmlFor="restore-confirmation"><input id="restore-confirmation" type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span>Confirmo que quiero restaurar este producto para que vuelva a aparecer entre los activos.</span></label><div className="product-form__actions"><Link className="button button--secondary" to={`/app/products/${productId}/archived`}>Cancelar</Link><Button type="submit" disabled={!confirmed || submitting}>{submitting ? "Restaurando producto…" : "Restaurar producto"}</Button></div></form></Card></section>;
}
