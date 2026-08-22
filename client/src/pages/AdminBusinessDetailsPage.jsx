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

function formatDate(value) {
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function statusLabel(status) {
  return { active: "Activo", suspended: "Suspendido", archived: "Archivado" }[status] ?? status;
}

function movementLabel(type) {
  return {
    opening_balance: "Saldo inicial",
    entry: "Entrada",
    exit: "Salida",
    adjustment: "Ajuste",
    transfer_out: "Transferencia — salida",
    transfer_in: "Transferencia — entrada"
  }[type] ?? type;
}

export function AdminBusinessDetailsPage() {
  const { businessId } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadBusiness = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setData(await apiRequest(`/admin/businesses/${businessId}`));
    } catch (requestError) {
      setError(requestError);
    } finally {
      setIsLoading(false);
    }
  }, [businessId]);

  useEffect(() => {
    loadBusiness();
  }, [loadBusiness]);

  if (isLoading) return <section className="dashboard-state"><Spinner label="Cargando negocio" /></section>;
  if (error?.code === "BUSINESS_NOT_FOUND" || error?.code === "VALIDATION_ERROR") return <EmptyState title="Negocio no encontrado" description="No hay un negocio disponible con ese identificador." action={<Link className="button button--secondary" to="/app/admin/businesses">Volver a negocios</Link>} />;
  if (error) return <Alert><div className="dashboard-error"><span>No fue posible cargar el negocio.</span><Button variant="secondary" onClick={loadBusiness}>Reintentar</Button></div></Alert>;

  const { business, metrics, members, recentMovements } = data;
  const membersByStatus = members.reduce((counts, member) => ({ ...counts, [member.status]: (counts[member.status] ?? 0) + 1 }), {});
  const canChangeOwner = ["active", "suspended"].includes(business.status);

  return <>
    <Link to="/app/admin/businesses" className="back-link"><ArrowLeft aria-hidden="true" />Volver a negocios</Link>
    <PageHeader title={business.name} description={`${business.slug} · ${statusLabel(business.status)}`} actions={<div className="product-filter-actions"><Link className="button button--primary" to={`/app/admin/businesses/${business.id}/edit`}>Editar negocio</Link>{canChangeOwner && <Link className="button button--secondary" to={`/app/admin/businesses/${business.id}/change-owner`}>Transferir propiedad</Link>}{business.status === "active" && <><Link className="button button--secondary" to={`/app/admin/businesses/${business.id}/suspend`}>Suspender</Link><Link className="button button--danger" to={`/app/admin/businesses/${business.id}/archive`}>Archivar</Link></>}{business.status === "suspended" && <><Link className="button button--primary" to={`/app/admin/businesses/${business.id}/reactivate`}>Reactivar</Link><Link className="button button--danger" to={`/app/admin/businesses/${business.id}/archive`}>Archivar</Link></>}</div>} />
    <section className="transfer-detail-grid">
      <Card><p className="eyebrow">Información general</p><dl className="detail-list"><div><dt>Razón social</dt><dd>{business.legalName || "Sin razón social"}</dd></div><div><dt>Identificación fiscal</dt><dd>{business.taxId || "Sin identificación"}</dd></div><div><dt>Moneda</dt><dd>{business.currency}</dd></div><div><dt>Zona horaria</dt><dd>{business.timezone}</dd></div><div><dt>Propietario actual</dt><dd>{data.owner ? `${data.owner.username} · ${data.owner.email}` : "Sin owner activo visible"}</dd></div><div><dt>Creado</dt><dd><time dateTime={business.createdAt}>{formatDate(business.createdAt)}</time></dd></div><div><dt>Actualizado</dt><dd><time dateTime={business.updatedAt}>{formatDate(business.updatedAt)}</time></dd></div></dl></Card>
      <Card><p className="eyebrow">Resumen operativo</p><dl className="detail-list"><div><dt>Miembros activos</dt><dd>{metrics.activeMembers}</dd></div><div><dt>Productos activos y archivados</dt><dd>{metrics.activeProducts} · {metrics.archivedProducts}</dd></div><div><dt>Ubicaciones activas</dt><dd>{metrics.activeLocations}</dd></div><div><dt>Stock total</dt><dd>{metrics.totalStock}</dd></div><div><dt>Transferencias</dt><dd>{metrics.transfers}</dd></div><div><dt>Umbrales configurados</dt><dd>{metrics.thresholds}</dd></div></dl></Card>
    </section>
    <section className="category-products"><header className="section-heading"><div><p className="eyebrow">Membresías</p><h2>Miembros por estado</h2></div></header><Card><p className="muted">{Object.entries(membersByStatus).map(([status, count]) => `${statusLabel(status)}: ${count}`).join(" · ") || "Sin membresías"}</p>{members.length === 0 ? <EmptyState title="Sin miembros" description="No hay membresías registradas para este negocio." /> : <section className="transfer-list" aria-label="Miembros del negocio">{members.map((member) => <div key={member.id} className="movement-row"><div><strong>{member.username}</strong><span>{member.email}</span></div><div><span>Rol: {member.role}</span><span>Estado: {statusLabel(member.status)}</span></div><time dateTime={member.joinedAt || member.createdAt}>{formatDate(member.joinedAt || member.createdAt)}</time></div>)}</section>}</Card></section>
    <section className="category-products"><header className="section-heading"><div><p className="eyebrow">Actividad reciente</p><h2>Últimos movimientos</h2></div></header>{recentMovements.length === 0 ? <EmptyState title="Sin movimientos recientes" description="Los movimientos recientes aparecerán aquí." /> : <section className="transfer-list" aria-label="Movimientos recientes">{recentMovements.map((movement) => <Card key={movement.id} className="transfer-card"><div className="transfer-card__header"><div><strong>{movement.product.name}</strong><span>{movement.product.sku}</span></div><strong>{movement.quantityDelta > 0 ? "+" : ""}{movement.quantityDelta}</strong></div><div className="transfer-card__meta"><div className="movement-card__title"><strong>{movementLabel(movement.type)}</strong><time dateTime={movement.createdAt}>{formatDate(movement.createdAt)}</time></div><span>{movement.location.name} ({movement.location.code})</span><span>{movement.createdBy.username}</span></div></Card>)}</section>}</section>
  </>;
}
