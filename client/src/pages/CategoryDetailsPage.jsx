import { ArrowLeft } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { apiRequest } from "../api/client.js";
import { Alert } from "../components/Alert.jsx";
import { Button } from "../components/Button.jsx";
import { Card } from "../components/Card.jsx";
import { EmptyState } from "../components/EmptyState.jsx";
import { PageHeader } from "../components/PageHeader.jsx";
import { Spinner } from "../components/Spinner.jsx";
import { useAuth } from "../context/AuthContext.jsx";

export function CategoryDetailsPage() {
  const { categoryId } = useParams();
  const { session } = useAuth();
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadCategory = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setData(await apiRequest(`/categories/${categoryId}`));
    } catch (requestError) {
      setError(requestError);
    } finally {
      setIsLoading(false);
    }
  }, [categoryId]);

  useEffect(() => {
    loadCategory();
  }, [loadCategory]);

  if (isLoading) return <section className="dashboard-state"><Spinner label="Cargando categoría" /></section>;
  if (error?.code === "CATEGORY_NOT_FOUND" || error?.code === "VALIDATION_ERROR") return <EmptyState title="Categoría no encontrada" description="La categoría no está disponible en el negocio activo." action={<Link className="button button--secondary" to="/app/categories">Volver a categorías</Link>} />;
  if (error) return <Alert><div className="dashboard-error"><span>No fue posible cargar la categoría.</span><Button variant="secondary" onClick={loadCategory}>Reintentar</Button></div></Alert>;

  const { category, products } = data;
  const currency = session.activeBusiness.currency;
  return <>
    <Link to="/app/categories" className="back-link"><ArrowLeft aria-hidden="true" />Volver a categorías</Link>
    <PageHeader title={category.name} description={category.description || "Sin descripción."} actions={<>{session.permissions.canManageInventory && <Link className="button button--primary" to={`/app/categories/${category.id}/edit`}>Editar categoría</Link>}{session.permissions.canDeleteInventory && <Link className="button button--danger" to={`/app/categories/${category.id}/delete`}>Eliminar categoría</Link>}</>} />
    <section className="category-detail-metrics"><Card><p className="eyebrow">Productos activos</p><strong>{category.activeProductCount}</strong></Card><Card><p className="eyebrow">Productos archivados</p><strong>{category.archivedProductCount}</strong></Card><Card><p className="eyebrow">Existencias activas</p><strong>{category.totalStock} unidades</strong></Card></section>
    <section className="category-products"><header className="section-heading"><div><p className="eyebrow">Productos activos</p><h2>Productos de la categoría</h2></div></header>{products.length === 0 ? <EmptyState title="Sin productos activos" description="Esta categoría no contiene productos activos." /> : <section className="product-grid" aria-label="Productos activos de la categoría">{products.map((product) => <Card key={product.id} className="product-card"><div className="product-card__heading"><span className="sku-badge">{product.sku}</span><span>{product.brand}</span></div><h3>{product.name}</h3><dl><div><dt>Precio</dt><dd>{new Intl.NumberFormat("es-MX", { style: "currency", currency }).format(product.price)}</dd></div><div><dt>Existencias</dt><dd>{product.stock} unidades</dd></div></dl><Link className="text-link" to={`/app/products/${product.id}`}>Ver producto</Link></Card>)}</section>}</section>
  </>;
}
