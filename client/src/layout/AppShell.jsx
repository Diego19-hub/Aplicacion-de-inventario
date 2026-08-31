import { ArrowRightLeft, Banknote, BellRing, Boxes, ChevronDown, ClipboardList, LayoutDashboard, LogOut, MapPin, Menu, PackageSearch, ReceiptText, Scale, Settings, ShoppingCart, Tags, Truck, UsersRound, Utensils, WalletCards } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { Button } from "../components/Button.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { HelpInfoPanel } from "../components/HelpInfoPanel.jsx";
import { apiRequest } from "../api/client.js";

const sidebarGroups = [
  { id: "home", label: "Inicio", icon: LayoutDashboard, items: [{ label: "Dashboard", to: "/app", icon: LayoutDashboard }] },
  { id: "inventory", label: "Inventario", icon: PackageSearch, items: [
    { label: "Productos", to: "/app/products", icon: PackageSearch },
    { label: "Categorías", to: "/app/categories", icon: Tags },
    { label: "Ubicaciones", to: "/app/locations", icon: MapPin },
    { label: "Proveedores", to: "/app/suppliers", icon: Truck }
  ] },
  { id: "operations", label: "Operaciones", icon: ShoppingCart, items: [
    { label: "Punto de venta", to: "/app/point-of-sale", icon: ShoppingCart, permission: "canManageInventory" },
    { label: "Caja", to: "/app/cash", icon: Banknote, roles: ["owner", "manager"] },
    { label: "Ventas", to: "/app/sales", icon: ReceiptText, roles: ["owner", "manager", "viewer"] },
    { label: "Cobranza", to: "/app/collections", icon: ReceiptText, permission: "canViewCustomerCollections" }
  ] },
  { id: "supply", label: "Abastecimiento", icon: Truck, items: [
    { label: "Compras", to: "/app/purchases", icon: Truck },
    { label: "Devoluciones", to: "/app/returns", icon: PackageSearch }
  ] },
  { id: "movements", label: "Movimientos", icon: ArrowRightLeft, items: [
    { label: "Entradas y ajustes", to: "/app/transactions", icon: PackageSearch },
    { label: "Transferencias", to: "/app/transfers", icon: ArrowRightLeft },
    { label: "Transacciones", to: "/app/transactions", icon: ClipboardList },
    { label: "Movimientos", to: "/app/movements", icon: PackageSearch }
  ] },
  { id: "production", label: "Producción", icon: Utensils, items: [
    { label: "Recetas", to: "/app/recipes", icon: Utensils, permission: "canManageInventory" }
  ] },
  { id: "analysis", label: "Análisis", icon: Scale, items: [
    { label: "Reportes", to: "/app/reports", icon: PackageSearch },
    { label: "Costos", to: "/app/costs", icon: WalletCards, roles: ["owner", "manager", "viewer"] },
    { label: "Punto de equilibrio", to: "/app/break-even", icon: Scale, roles: ["owner", "manager", "viewer"] },
    { label: "Alertas", to: "/app/alerts", icon: BellRing }
  ] },
  { id: "admin", label: "Administración", icon: Settings, items: [
    { label: "Equipo", to: "/app/members", icon: UsersRound, permission: "canManageMembers" },
    { label: "Bitácora", to: "/app/audit-log", icon: ClipboardList },
    { label: "Administración", to: "/app/admin", icon: UsersRound, superAdmin: true },
    { label: "Configuración", to: "/app/settings", icon: Settings }
  ] }
];

function isNavItemVisible(item, session) {
  if (item.permission && !session.permissions[item.permission]) return false;
  if (item.roles && !item.roles.includes(session.membership?.role)) return false;
  if (item.superAdmin && session.user.platformRole !== "super_admin") return false;
  return true;
}

function groupContainsPath(group, pathname) {
  return group.items.some((item) => item.to === "/app" ? pathname === "/app" : pathname.startsWith(item.to));
}

export function AppShell({ children }) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [notifications, setNotifications] = useState({ unreadCount: 0, notifications: [] });
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const { logout, session } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const activeBusinessName = session.activeBusiness?.name ?? "Administración global";
  const helpModule = location.pathname === "/app" ? "dashboard" : location.pathname === "/app/costs" ? "costs" : location.pathname === "/app/collections" ? "collections" : location.pathname === "/app/purchases" || location.pathname === "/app/purchases/new" ? "purchases" : location.pathname === "/app/alerts" ? "alerts" : location.pathname === "/app/reports" ? "reports" : location.pathname === "/app/reports/inventory" ? "inventory" : null;
  const visibleGroups = useMemo(() => sidebarGroups.map((group) => ({ ...group, items: group.items.filter((item) => isNavItemVisible(item, session)) })).filter((group) => group.items.length > 0), [session]);
  const activeGroup = visibleGroups.find((group) => groupContainsPath(group, location.pathname))?.id ?? "home";
  const storageKey = `sidebar_open_sections:${session.user?.id ?? "anonymous"}:${session.activeBusiness?.id ?? "global"}`;
  const [openGroups, setOpenGroups] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
      return Array.isArray(saved) && saved.length ? saved : [activeGroup];
    } catch {
      return [activeGroup];
    }
  });

  useEffect(() => {
    setOpenGroups((current) => current.includes(activeGroup) ? current : [...current, activeGroup]);
  }, [activeGroup]);

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(openGroups));
  }, [openGroups, storageKey]);

  function toggleGroup(groupId) {
    setOpenGroups((current) => {
      if (current.includes(groupId)) return current.filter((id) => id !== groupId);
      return window.matchMedia("(min-width: 901px)").matches ? [groupId] : [...current, groupId];
    });
  }

  useEffect(() => {
    let cancelled = false;
    async function loadNotifications() {
      try {
        const response = await apiRequest("/notifications/summary");
        if (!cancelled) setNotifications(response.data || response);
      } catch (error) {
        if (error.name !== "AbortError") return;
      }
    }
    loadNotifications();
    const timer = window.setInterval(loadNotifications, 60000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [session.activeBusiness?.id]);

  async function markNotificationRead(notification) {
    if (notification.is_read) return;
    await apiRequest(`/notifications/${notification.id}/read`, { method: "PATCH", csrf: true });
    setNotifications((current) => ({ ...current, unreadCount: Math.max(0, current.unreadCount - 1), notifications: current.notifications.map((item) => item.id === notification.id ? { ...item, is_read: true } : item) }));
  }

  function closeMobileMenu() {
    setIsMobileMenuOpen(false);
  }

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape") closeMobileMenu();
    }

    function handleResize() {
      if (window.matchMedia("(min-width: 901px)").matches) closeMobileMenu();
    }

    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleResize);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  useEffect(() => {
    if (!isMobileMenuOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isMobileMenuOpen]);

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="app-shell">
      {isMobileMenuOpen && (
        <button
          type="button"
          className="sidebar-overlay"
          aria-label="Cerrar menú"
          onPointerDown={closeMobileMenu}
        />
      )}
      <aside className={`sidebar ${isMobileMenuOpen ? "sidebar--open" : ""}`} aria-label="Navegación principal">
        <Link to="/app" className="brand"><Boxes aria-hidden="true" /><span>Inventario</span></Link>
        <nav className="sidebar__nav">
          {visibleGroups.map((group) => {
            const GroupIcon = group.icon;
            const expanded = openGroups.includes(group.id);
            return <section className={`nav-group ${expanded ? "nav-group--expanded" : ""}`} key={group.id}>
              <button type="button" className={`nav-group__button ${group.id === activeGroup ? "nav-group__button--active" : ""}`} aria-expanded={expanded} onClick={() => toggleGroup(group.id)}>
                <GroupIcon aria-hidden="true" /><span>{group.label}</span><ChevronDown className="nav-group__chevron" aria-hidden="true" />
              </button>
              {expanded && <div className="nav-group__items">{group.items.map((item) => { const ItemIcon = item.icon; const active = item.to === "/app" ? location.pathname === "/app" : location.pathname.startsWith(item.to); return <Link key={`${group.id}-${item.to}-${item.label}`} to={item.to} className={`nav-link ${active ? "nav-link--active" : ""}`} onClick={closeMobileMenu}><ItemIcon aria-hidden="true" /><span>{item.label}</span></Link>; })}</div>}
            </section>;
          })}
        </nav>
        <div className="sidebar__footer"><span className="business-chip">{activeBusinessName}</span><Button variant="ghost" onClick={handleLogout}><LogOut aria-hidden="true" />Cerrar sesión</Button></div>
      </aside>
      <div className="app-shell__content">
        <header className="topbar">
          <Button variant="ghost" className="mobile-menu-button" onClick={() => setIsMobileMenuOpen((open) => !open)} aria-expanded={isMobileMenuOpen} aria-label="Mostrar navegación"><Menu aria-hidden="true" /></Button>
          <div><span className="topbar__label">{session.activeBusiness ? "Negocio activo" : "Área actual"}</span><strong>{activeBusinessName}</strong></div>
          <div className="topbar__actions"><div className="notification-bell"><button type="button" className="notification-bell__button" aria-label={`Notificaciones${notifications.unreadCount ? `, ${notifications.unreadCount} no leídas` : ""}`} aria-expanded={notificationsOpen} onClick={() => setNotificationsOpen((open) => !open)}><BellRing aria-hidden="true" />{notifications.unreadCount > 0 && <span className="notification-bell__count">{notifications.unreadCount > 99 ? "99+" : notifications.unreadCount}</span>}</button>{notificationsOpen && <div className="notification-popover" role="dialog" aria-label="Notificaciones recientes"><strong>Notificaciones</strong>{notifications.notifications.length ? notifications.notifications.map((notification) => <Link key={notification.id} to={notification.link || "/app/notifications"} className={`notification-popover__item ${notification.is_read ? "notification-popover__item--read" : ""}`} onClick={() => { markNotificationRead(notification).catch(() => undefined); setNotificationsOpen(false); }}><span>{notification.title}</span><small>{notification.message}</small></Link>) : <span className="notification-popover__empty">No hay notificaciones nuevas.</span>}<Link className="text-link" to="/app/notifications" onClick={() => setNotificationsOpen(false)}>Ver todas</Link></div>}</div><Link to="/select-business" className="text-link">Cambiar negocio</Link></div>
        </header>
        <main className="main-content">{helpModule && <HelpInfoPanel moduleKey={helpModule} businessId={session.activeBusiness?.id} />}{children}</main>
      </div>
    </div>
  );
}
