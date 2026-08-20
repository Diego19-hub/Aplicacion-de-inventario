import { ArrowRightLeft, BellRing, Boxes, LayoutDashboard, LogOut, MapPin, Menu, PackageSearch, Settings, Tags, Truck, UsersRound } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { Button } from "../components/Button.jsx";
import { useAuth } from "../context/AuthContext.jsx";

export function AppShell({ children }) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { logout, session } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const activeBusinessName = session.activeBusiness?.name ?? "Administración global";

  function closeMobileMenu() {
    setIsMobileMenuOpen(false);
  }

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape") closeMobileMenu();
    }

    function handleResize() {
      if (window.matchMedia("(min-width: 761px)").matches) closeMobileMenu();
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
          <Link to="/app/categories" className={`nav-link ${location.pathname.startsWith("/app/categories") ? "nav-link--active" : ""}`}><Tags aria-hidden="true" />Categorías</Link>
          <Link to="/app/locations" className={`nav-link ${location.pathname.startsWith("/app/locations") ? "nav-link--active" : ""}`}><MapPin aria-hidden="true" />Ubicaciones</Link>
          <Link to="/app/suppliers" className={`nav-link ${location.pathname.startsWith("/app/suppliers") ? "nav-link--active" : ""}`}><Truck aria-hidden="true" />Proveedores</Link>
          <Link to="/app/transfers" className={`nav-link ${location.pathname.startsWith("/app/transfers") ? "nav-link--active" : ""}`}><ArrowRightLeft aria-hidden="true" />Transferencias</Link>
          <Link to="/app/movements" className={`nav-link ${location.pathname.startsWith("/app/movements") ? "nav-link--active" : ""}`}><PackageSearch aria-hidden="true" />Movimientos</Link>
          <Link to="/app/alerts" className={`nav-link ${location.pathname.startsWith("/app/alerts") ? "nav-link--active" : ""}`}><BellRing aria-hidden="true" />Alertas</Link>
          <Link to="/app/reports" className={`nav-link ${location.pathname.startsWith("/app/reports") ? "nav-link--active" : ""}`}><PackageSearch aria-hidden="true" />Reportes</Link>
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
          <Link to="/select-business" className="text-link">Cambiar negocio</Link>
        </header>
        <main className="main-content">{children}</main>
      </div>
    </div>
  );
}
