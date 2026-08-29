import { ArrowRightLeft, Banknote, BellRing, Boxes, ClipboardList, LayoutDashboard, LogOut, MapPin, Menu, PackageSearch, ReceiptText, Scale, Settings, ShoppingCart, Tags, Truck, UsersRound, Utensils, WalletCards } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { Button } from "../components/Button.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { HelpInfoPanel } from "../components/HelpInfoPanel.jsx";
import { apiRequest } from "../api/client.js";

export function AppShell({ children }) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [notifications, setNotifications] = useState({ unreadCount: 0, notifications: [] });
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const { logout, session } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const activeBusinessName = session.activeBusiness?.name ?? "Administración global";
  const canViewSales = ["owner", "manager", "viewer"].includes(session.membership?.role);
  const canManageCash = ["owner", "manager"].includes(session.membership?.role);
  const canViewCosts = ["owner", "manager", "viewer"].includes(session.membership?.role);
  const helpModule = location.pathname === "/app" ? "dashboard" : location.pathname === "/app/costs" ? "costs" : location.pathname === "/app/collections" ? "collections" : location.pathname === "/app/purchases" || location.pathname === "/app/purchases/new" ? "purchases" : location.pathname === "/app/alerts" ? "alerts" : location.pathname === "/app/reports" ? "reports" : location.pathname === "/app/reports/inventory" ? "inventory" : null;

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
      <aside className={`sidebar ${isMobileMenuOpen ? "sidebar--open" : ""}`} aria-label="Navegación principal" onClick={closeMobileMenu}>
        <Link to="/app" className="brand"><Boxes aria-hidden="true" /><span>Inventario</span></Link>
        <nav className="sidebar__nav" onClick={closeMobileMenu}>
          <Link to="/app" className={`nav-link ${location.pathname === "/app" ? "nav-link--active" : ""}`}><LayoutDashboard aria-hidden="true" />Dashboard</Link>
          <Link to="/app/products" className={`nav-link ${location.pathname === "/app/products" ? "nav-link--active" : ""}`}><PackageSearch aria-hidden="true" />Productos</Link>
          {session.permissions.canManageInventory && <Link to="/app/recipes" className={`nav-link ${location.pathname.startsWith("/app/recipes") ? "nav-link--active" : ""}`}><Utensils aria-hidden="true" />Recetas</Link>}
          <Link to="/app/categories" className={`nav-link ${location.pathname.startsWith("/app/categories") ? "nav-link--active" : ""}`}><Tags aria-hidden="true" />Categorías</Link>
          <Link to="/app/locations" className={`nav-link ${location.pathname.startsWith("/app/locations") ? "nav-link--active" : ""}`}><MapPin aria-hidden="true" />Ubicaciones</Link>
          <Link to="/app/suppliers" className={`nav-link ${location.pathname.startsWith("/app/suppliers") ? "nav-link--active" : ""}`}><Truck aria-hidden="true" />Proveedores</Link>
          <Link to="/app/transfers" className={`nav-link ${location.pathname.startsWith("/app/transfers") ? "nav-link--active" : ""}`}><ArrowRightLeft aria-hidden="true" />Transferencias</Link>
          <Link to="/app/purchases" className={`nav-link ${location.pathname.startsWith("/app/purchases") ? "nav-link--active" : ""}`}><Truck aria-hidden="true" />Compras</Link>
          <Link to="/app/returns" className={`nav-link ${location.pathname.startsWith("/app/returns") ? "nav-link--active" : ""}`}><PackageSearch aria-hidden="true" />Devoluciones</Link>
          {session.permissions.canManageInventory && <Link to="/app/point-of-sale" className={`nav-link ${location.pathname.startsWith("/app/point-of-sale") ? "nav-link--active" : ""}`}><ShoppingCart aria-hidden="true" />Punto de venta</Link>}
          {canManageCash && <Link to="/app/cash" className={`nav-link ${location.pathname.startsWith("/app/cash") ? "nav-link--active" : ""}`}><Banknote aria-hidden="true" />Caja</Link>}
          {canViewSales && <Link to="/app/sales" className={`nav-link ${location.pathname.startsWith("/app/sales") ? "nav-link--active" : ""}`}><ReceiptText aria-hidden="true" />Ventas</Link>}
          {session.permissions.canViewCustomerCollections && <Link to="/app/collections" className={`nav-link ${location.pathname.startsWith("/app/collections") ? "nav-link--active" : ""}`}><ReceiptText aria-hidden="true" />Cobranza</Link>}
          {canViewCosts && <Link to="/app/costs" className={`nav-link ${location.pathname.startsWith("/app/costs") ? "nav-link--active" : ""}`}><WalletCards aria-hidden="true" />Costos</Link>}
          {canViewCosts && <Link to="/app/break-even" className={`nav-link ${location.pathname.startsWith("/app/break-even") ? "nav-link--active" : ""}`}><Scale aria-hidden="true" />Punto de equilibrio</Link>}
          <Link to="/app/transactions" className={`nav-link ${location.pathname.startsWith("/app/transactions") ? "nav-link--active" : ""}`}><PackageSearch aria-hidden="true" />Transacciones</Link>
          <Link to="/app/movements" className={`nav-link ${location.pathname.startsWith("/app/movements") ? "nav-link--active" : ""}`}><PackageSearch aria-hidden="true" />Movimientos</Link>
          <Link to="/app/alerts" className={`nav-link ${location.pathname.startsWith("/app/alerts") ? "nav-link--active" : ""}`}><BellRing aria-hidden="true" />Alertas</Link>
          <Link to="/app/reports" className={`nav-link ${location.pathname.startsWith("/app/reports") ? "nav-link--active" : ""}`}><PackageSearch aria-hidden="true" />Reportes</Link>
          <Link to="/app/audit-log" className={`nav-link ${location.pathname.startsWith("/app/audit-log") ? "nav-link--active" : ""}`}><ClipboardList aria-hidden="true" />Bitácora</Link>
          {session.permissions.canManageMembers && <Link to="/app/members" className={`nav-link ${location.pathname.startsWith("/app/members") ? "nav-link--active" : ""}`}><UsersRound aria-hidden="true" />Equipo</Link>}
          {session.user.platformRole === "super_admin" && <Link to="/app/admin" className={`nav-link ${location.pathname.startsWith("/app/admin") ? "nav-link--active" : ""}`}><UsersRound aria-hidden="true" />Administración</Link>}
          <Link to="/app/settings" className={`nav-link ${location.pathname.startsWith("/app/settings") ? "nav-link--active" : ""}`}><Settings aria-hidden="true" />Configuración</Link>
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
