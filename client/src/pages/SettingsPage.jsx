import {
  BellRing,
  Building2,
  FileText,
  LogOut,
  MapPin,
  UserRound,
  UsersRound
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { apiRequest } from "../api/client.js";
import { Alert } from "../components/Alert.jsx";
import { Button } from "../components/Button.jsx";
import { Card } from "../components/Card.jsx";
import { PageHeader } from "../components/PageHeader.jsx";
import { Select } from "../components/Select.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { resetHelpInfoPanels } from "../components/HelpInfoPanel.jsx";

function roleLabel(role) {
  return { owner: "Owner", manager: "Manager", viewer: "Viewer" }[role] ?? role ?? "Sin rol";
}

function platformRoleLabel(role) {
  return role === "super_admin" ? "Superadministrador" : "Usuario";
}

const valuationLabels = { average: "Promedio", fifo: "PEPS/FIFO" };

function ValuationSettingsCard({ membership, businessId }) {
  const canEdit = ["owner", "manager"].includes(membership?.role);
  const [settings, setSettings] = useState(null);
  const [method, setMethod] = useState("average");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setSuccess("");
    setSettings(null);
    setMethod("average");
    apiRequest("/business/settings/valuation")
      .then((data) => {
        if (!active) return;
        setSettings(data);
        setMethod(data.valuationMethod);
      })
      .catch((requestError) => {
        if (active) setError(requestError.message || "No se pudo cargar el método de valuación.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [businessId]);

  async function save() {
    if (!canEdit || !settings || method === settings.valuationMethod) return;
    const confirmation = method === "fifo"
      ? "Al activar PEPS/FIFO, los saldos existentes sin capa deberán inicializarse manualmente. No se modificarán movimientos históricos."
      : "¿Confirmar el cambio del método de valuación a Promedio?";
    if (!window.confirm(confirmation)) {
      setMethod(settings.valuationMethod);
      return;
    }
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const data = await apiRequest("/business/settings/valuation", { method: "PATCH", body: { valuationMethod: method }, csrf: true });
      setSettings(data);
      setMethod(data.valuationMethod);
      setSuccess("Método de valuación actualizado correctamente.");
    } catch (requestError) {
      setMethod(settings.valuationMethod);
      setError(requestError.status === 403
        ? "No tienes permisos para modificar el método de valuación."
        : requestError.message || "No se pudo actualizar el método de valuación.");
    } finally {
      setSaving(false);
    }
  }

  return <Card className="settings-card settings-valuation-card">
    <div className="settings-card__heading"><Building2 aria-hidden="true" className="card-icon" /><div><p className="eyebrow">Inventario</p><h2>Método de valuación del inventario</h2></div></div>
    {loading ? <p className="muted" role="status">Cargando método actual…</p> : error && !settings ? <Alert>{error}</Alert> : <>
      <p className="settings-card__description"><strong>Promedio:</strong> conserva el comportamiento actual.</p>
      <p className="settings-card__description"><strong>PEPS/FIFO:</strong> consume primero las capas más antiguas.</p>
      {canEdit ? <>
        <p className="settings-card__note"><strong>Método actual:</strong> {valuationLabels[settings.valuationMethod] ?? settings.valuationMethod}</p>
        <Select id="valuation-method" label="Método actual" value={method} onChange={(event) => { setMethod(event.target.value); setSuccess(""); }} disabled={saving}>
          <option value="average">Promedio</option>
          <option value="fifo">PEPS/FIFO</option>
        </Select>
        {method === "fifo" && <p className="settings-warning" role="note">Los saldos existentes sin capa requieren inicialización manual. Activar esta opción no crea capas ni altera movimientos históricos.</p>}
        <Button onClick={save} disabled={saving || method === settings.valuationMethod}>{saving ? "Guardando…" : "Guardar método"}</Button>
      </> : <p className="settings-card__note"><strong>Método actual:</strong> {valuationLabels[settings.valuationMethod] ?? settings.valuationMethod}</p>}
      {success && <Alert variant="success">{success}</Alert>}
      {error && <Alert>{error}</Alert>}
      {!canEdit && <p className="muted settings-card__note">Solo owner y manager pueden modificar esta configuración.</p>}
    </>}
  </Card>;
}

export function SettingsPage() {
  const { logout, session } = useAuth();
  const navigate = useNavigate();
  const { activeBusiness, membership, permissions, user } = session;

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  return <>
    <PageHeader title="Configuración" description="Administra la información visible de tu cuenta y del negocio activo." /><Card className="settings-card settings-help-reset"><p className="eyebrow">Ayudas</p><h2>Explicaciones de módulos</h2><p className="muted">Puedes ocultar explicaciones por pantalla y recuperarlas cuando quieras.</p><Button variant="secondary" onClick={resetHelpInfoPanels}>Volver a mostrar todas las explicaciones</Button></Card>

    <section className="settings-grid" aria-label="Configuración de la cuenta">
      <Card className="settings-card">
        <div className="settings-card__heading"><UserRound aria-hidden="true" className="card-icon" /><div><p className="eyebrow">Cuenta</p><h2>Perfil</h2></div></div>
        <dl className="detail-list">
          <div><dt>Nombre de usuario</dt><dd>{user?.username ?? "—"}</dd></div>
          <div><dt>Correo electrónico</dt><dd>{user?.email || "No disponible"}</dd></div>
          <div><dt>Rol global</dt><dd>{platformRoleLabel(user?.platformRole)}</dd></div>
          <div><dt>Rol en el negocio</dt><dd>{roleLabel(membership?.role)}</dd></div>
        </dl>
        <p className="muted settings-card__note">La edición del perfil todavía no está disponible en este espacio.</p>
      </Card>

      <ValuationSettingsCard membership={membership} businessId={activeBusiness?.id} />

      <Card className="settings-card">
        <div className="settings-card__heading"><Building2 aria-hidden="true" className="card-icon" /><div><p className="eyebrow">Espacio de trabajo</p><h2>Negocio activo</h2></div></div>
        <dl className="detail-list">
          <div><dt>Nombre</dt><dd>{activeBusiness?.name ?? "—"}</dd></div>
          <div><dt>Slug</dt><dd>{activeBusiness?.slug ?? "—"}</dd></div>
          <div><dt>Moneda</dt><dd>{activeBusiness?.currency ?? "—"}</dd></div>
          <div><dt>Zona horaria</dt><dd>{activeBusiness?.timezone ?? "—"}</dd></div>
          <div><dt>Ubicación activa</dt><dd><span className="settings-inline-value"><MapPin aria-hidden="true" />Se administra desde Ubicaciones</span></dd></div>
        </dl>
        <Link className="button button--secondary" to="/select-business">Cambiar negocio</Link>
      </Card>

      <Card className="settings-card">
        <div className="settings-card__heading"><Building2 aria-hidden="true" className="card-icon" /><div><p className="eyebrow">Configuración del negocio</p><h2>Preferencias</h2></div></div>
        <dl className="detail-list">
          <div><dt>Moneda del negocio</dt><dd>{activeBusiness?.currency ?? "—"}</dd></div>
          <div><dt>Zona horaria</dt><dd>{activeBusiness?.timezone ?? "—"}</dd></div>
          <div><dt>Notificaciones</dt><dd>Las alertas de inventario están disponibles en Alertas.</dd></div>
        </dl>
        <Link className="button button--secondary" to="/app/alerts"><BellRing aria-hidden="true" />Ver alertas</Link>
      </Card>

      <Card className="settings-card">
        <div className="settings-card__heading"><UserRound aria-hidden="true" className="card-icon" /><div><p className="eyebrow">Sesión actual</p><h2>Seguridad y sesión</h2></div></div>
        <p className="settings-card__description">Tu sesión está protegida mediante autenticación, autorización y protección CSRF.</p>
        <dl className="detail-list"><div><dt>Usuario actual</dt><dd>{user?.username ?? "—"}</dd></div><div><dt>Negocio activo</dt><dd>{activeBusiness?.name ?? "Sin negocio seleccionado"}</dd></div></dl>
        <div className="account-session__actions"><Button variant="danger" className="button--compact" onClick={handleLogout}><LogOut aria-hidden="true" />Cerrar sesión</Button></div>
      </Card>
    </section>

    <section className="settings-links" aria-label="Accesos relacionados">
      <header className="section-heading"><div><p className="eyebrow">Accesos</p><h2>Administración del espacio</h2></div></header>
      <div className="settings-links__grid">
        {permissions.canManageMembers && <Card><UsersRound aria-hidden="true" className="card-icon" /><h3>Equipo</h3><p className="muted">Gestiona miembros e invitaciones.</p><Link className="text-link" to="/app/members">Abrir equipo</Link></Card>}
        <Card><MapPin aria-hidden="true" className="card-icon" /><h3>Ubicaciones</h3><p className="muted">Consulta y administra las ubicaciones del negocio.</p><Link className="text-link" to="/app/locations">Abrir ubicaciones</Link></Card>
        <Card><FileText aria-hidden="true" className="card-icon" /><h3>Reportes</h3><p className="muted">Consulta existencias y movimientos.</p><Link className="text-link" to="/app/reports">Abrir reportes</Link></Card>
      </div>
    </section>

    <section className="settings-danger" aria-labelledby="settings-danger-title">
      <Card>
        <p className="eyebrow">Acciones sensibles</p>
        <h2 id="settings-danger-title">Zona de peligro</h2>
        <p className="muted">No hay acciones de eliminación disponibles porque todavía no existe un flujo seguro para borrar el negocio o la cuenta.</p>
      </Card>
    </section>
  </>;
}
