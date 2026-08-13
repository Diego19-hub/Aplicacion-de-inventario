import { ArrowLeft, Pencil, RotateCcw, UserX } from "lucide-react";
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

function formatDate(value) {
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function valueOrFallback(value, fallback) {
  return value || fallback;
}

export function SupplierDetailsPage() {
  const { supplierId } = useParams();
  const { session } = useAuth();
  const [supplier, setSupplier] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadSupplier = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await apiRequest(`/suppliers/${supplierId}`);
      setSupplier(response.supplier);
    } catch (requestError) {
      setError(requestError);
    } finally {
      setIsLoading(false);
    }
  }, [supplierId]);

  useEffect(() => {
    loadSupplier();
  }, [loadSupplier]);

  if (isLoading) return <section className="dashboard-state"><Spinner label="Cargando proveedor" /></section>;
  if (error?.code === "SUPPLIER_NOT_FOUND" || error?.code === "VALIDATION_ERROR") return <EmptyState title="Proveedor no encontrado" description="El proveedor no está disponible en el negocio activo." action={<Link className="button button--secondary" to="/app/suppliers">Volver a proveedores</Link>} />;
  if (error) return <Alert><div className="dashboard-error"><span>No fue posible cargar el proveedor.</span><Button variant="secondary" onClick={loadSupplier}>Reintentar</Button></div></Alert>;

  return <>
    <Link to="/app/suppliers" className="back-link"><ArrowLeft aria-hidden="true" />Volver a proveedores</Link>
    <PageHeader title={supplier.name} description={`Estado: ${supplier.status === "active" ? "Activo" : "Inactivo"}`} actions={session.permissions.canManageInventory ? <><Link className="button" to={`/app/suppliers/${supplier.id}/edit`}><Pencil aria-hidden="true" />Editar proveedor</Link>{supplier.status === "active" ? <Link className="button button--danger" to={`/app/suppliers/${supplier.id}/deactivate`}><UserX aria-hidden="true" />Desactivar proveedor</Link> : <Link className="button" to={`/app/suppliers/${supplier.id}/reactivate`}><RotateCcw aria-hidden="true" />Reactivar proveedor</Link>}</> : null} />
    <section className="transfer-detail-grid"><Card><p className="eyebrow">Información empresarial</p><dl className="detail-list"><div><dt>Razón social</dt><dd>{valueOrFallback(supplier.legalName, "Sin razón social registrada")}</dd></div><div><dt>RFC</dt><dd>{valueOrFallback(supplier.taxId, "Sin RFC registrado")}</dd></div><div><dt>Dirección</dt><dd>{valueOrFallback(supplier.address, "Sin dirección registrada")}</dd></div><div><dt>Notas</dt><dd>{valueOrFallback(supplier.notes, "Sin notas registradas")}</dd></div></dl></Card><Card><p className="eyebrow">Contacto</p><dl className="detail-list"><div><dt>Persona de contacto</dt><dd>{valueOrFallback(supplier.contactName, "Sin contacto registrado")}</dd></div><div><dt>Correo</dt><dd>{supplier.email ? <a className="text-link" href={`mailto:${supplier.email}`}>{supplier.email}</a> : "Sin correo registrado"}</dd></div><div><dt>Teléfono</dt><dd>{valueOrFallback(supplier.phone, "Sin teléfono registrado")}</dd></div></dl></Card></section>
    <Card><p className="eyebrow">Registro</p><dl className="detail-list"><div><dt>Creado</dt><dd><time dateTime={supplier.createdAt}>{formatDate(supplier.createdAt)}</time></dd></div><div><dt>Última actualización</dt><dd><time dateTime={supplier.updatedAt}>{formatDate(supplier.updatedAt)}</time></dd></div></dl></Card>
  </>;
}
