import { ArrowRightLeft, Boxes, LayoutDashboard, LogOut, MapPin, Menu, PackageSearch, Tags } from "lucide-react";
import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { Button } from "../components/Button.jsx";
import { useAuth } from "../context/AuthContext.jsx";

const upcomingSections = ["Movimientos", "Reportes", "Configuración"];

export function AppShell({ children }) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { logout, session } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${isMobileMenuOpen ? "sidebar--open" : ""}`} aria-label="Navegación principal">
        <Link to="/app" className="brand"><Boxes aria-hidden="true" /><span>Inventario</span></Link>
        <nav className="sidebar__nav">
          <Link to="/app" className={`nav-link ${location.pathname === "/app" ? "nav-link--active" : ""}`}><LayoutDashboard aria-hidden="true" />Dashboard</Link>
          <Link to="/app/products" className={`nav-link ${location.pathname === "/app/products" ? "nav-link--active" : ""}`}><PackageSearch aria-hidden="true" />Productos</Link>
          <Link to="/app/categories" className={`nav-link ${location.pathname.startsWith("/app/categories") ? "nav-link--active" : ""}`}><Tags aria-hidden="true" />Categorías</Link>
          <Link to="/app/locations" className={`nav-link ${location.pathname.startsWith("/app/locations") ? "nav-link--active" : ""}`}><MapPin aria-hidden="true" />Ubicaciones</Link>
          <Link to="/app/transfers" className={`nav-link ${location.pathname.startsWith("/app/transfers") ? "nav-link--active" : ""}`}><ArrowRightLeft aria-hidden="true" />Transferencias</Link>
          {upcomingSections.map((section) => <span key={section} className="nav-link nav-link--disabled"><PackageSearch aria-hidden="true" />{section}<small>Próximamente</small></span>)}
        </nav>
        <div className="sidebar__footer"><span className="business-chip">{session.activeBusiness.name}</span><Button variant="ghost" onClick={handleLogout}><LogOut aria-hidden="true" />Cerrar sesión</Button></div>
      </aside>
      <div className="app-shell__content">
        <header className="topbar">
          <Button variant="ghost" className="mobile-menu-button" onClick={() => setIsMobileMenuOpen((open) => !open)} aria-expanded={isMobileMenuOpen} aria-label="Mostrar navegación"><Menu aria-hidden="true" /></Button>
          <div><span className="topbar__label">Negocio activo</span><strong>{session.activeBusiness.name}</strong></div>
          <Link to="/select-business" className="text-link">Cambiar negocio</Link>
        </header>
        <main className="main-content">{children}</main>
      </div>
    </div>
  );
}
