import {
  BellRing,
  Boxes,
  Check,
  MapPin,
  Package,
  ShieldCheck,
  Truck,
  Users,
  ArrowRight,
  BarChart3
} from "lucide-react";
import { Link } from "react-router-dom";

import { Card } from "../components/Card.jsx";

const demoStats = [
  { label: "Productos activos", value: "15" },
  { label: "Unidades totales", value: "428" },
  { label: "Valor de inventario", value: "$128,450.00" },
  { label: "Alertas de stock", value: "3" }
];

const features = [
  [Package, "Control de productos", "Centraliza fichas, SKU, precios y existencias en un solo lugar."],
  [BellRing, "Alertas de stock", "Anticípate a faltantes con umbrales claros y accionables."],
  [MapPin, "Varias ubicaciones", "Conoce cuánto tienes en cada sucursal o almacén."],
  [BarChart3, "Movimientos de inventario", "Registra entradas, salidas y transferencias con trazabilidad."],
  [Boxes, "Proveedores y categorías", "Ordena tu catálogo para encontrar la información más rápido."],
  [Users, "Usuarios y permisos", "Invita a tu equipo y controla qué puede consultar o modificar."]
];

const categoryBars = [
  ["Reactivos", 82], ["Consumibles", 64], ["Controles", 48], ["Material de empaque", 30]
];

export function LandingPage() {
  return <main className="landing-page">
    <nav className="landing-nav" aria-label="Navegación principal">
      <Link className="landing-brand" to="/"><span className="landing-brand__mark"><Boxes aria-hidden="true" /></span>Inventario</Link>
      <div className="landing-nav__links"><a href="#caracteristicas">Características</a><a href="#como-funciona">Cómo funciona</a></div>
      <div className="landing-nav__actions"><Link className="landing-login" to="/login">Iniciar sesión</Link><Link className="button button--primary" to="/register">Crear cuenta</Link></div>
    </nav>

    <section className="landing-hero">
      <div className="landing-hero__copy"><p className="eyebrow">Inventario simple para equipos que avanzan</p><h1>Controla tu inventario con claridad</h1><p className="landing-lead">Administra productos, existencias, ubicaciones y movimientos desde un solo lugar.</p><div className="landing-hero__actions"><Link className="button button--primary" to="/register">Crear mi cuenta <ArrowRight aria-hidden="true" /></Link><a className="button button--secondary" href="#caracteristicas">Ver cómo funciona</a></div><p className="landing-note"><ShieldCheck aria-hidden="true" /> Diseñado para crecer contigo, sin hojas de cálculo dispersas.</p></div>
      <div className="landing-preview-wrap"><p className="landing-preview-label">Vista previa del dashboard</p><Card className="landing-preview"><div className="landing-preview__top"><div><span className="landing-mini-label">Negocio demo</span><strong>Resumen del inventario</strong></div><span className="landing-status">Activo</span></div><div className="landing-demo-stats">{demoStats.map((stat) => <div key={stat.label}><span>{stat.label}</span><strong>{stat.value}</strong></div>)}</div><div className="landing-demo-grid"><div className="landing-demo-chart"><div className="landing-demo-heading"><strong>Entradas y salidas</strong><span>30 días</span></div><svg viewBox="0 0 360 130" preserveAspectRatio="none" aria-label="Gráfico demo de entradas y salidas"><polyline points="0,105 45,86 90,96 135,60 180,72 225,42 270,55 315,24 360,35" /><polyline className="landing-chart-line--secondary" points="0,115 45,104 90,108 135,90 180,98 225,70 270,84 315,65 360,74" /></svg></div><div className="landing-demo-bars"><strong>Stock por categoría</strong>{categoryBars.map(([label, value]) => <div key={label}><span>{label}</span><div><i style={{ width: `${value}%` }} /></div></div>)}</div></div><div className="landing-demo-alert"><BellRing aria-hidden="true" /><span><strong>3 alertas de stock</strong><small>Revisa productos antes de quedarte sin existencias.</small></span></div></Card></div>
    </section>

    <section className="landing-section" id="caracteristicas"><div className="landing-section__heading"><p className="eyebrow">Todo en un solo lugar</p><h2>Una operación más ordenada, desde el primer día</h2><p>Las herramientas esenciales para que tu equipo tenga contexto y tome mejores decisiones.</p></div><div className="landing-feature-grid">{features.map(([Icon, title, description]) => <Card className="landing-feature" key={title}><span className="landing-feature__icon"><Icon aria-hidden="true" /></span><h3>{title}</h3><p>{description}</p></Card>)}</div></section>

    <section className="landing-how" id="como-funciona"><div className="landing-section__heading"><p className="eyebrow">Cómo funciona</p><h2>Empieza sin complicaciones</h2></div><div className="landing-steps">{[["01", "Regístrate", "Crea tu cuenta en unos minutos."], ["02", "Crea tu negocio", "Configura tu espacio y tus ubicaciones."], ["03", "Controla tu inventario", "Invita a tu equipo y empieza a operar."]].map(([number, title, description]) => <div className="landing-step" key={number}><span>{number}</span><div><h3>{title}</h3><p>{description}</p></div></div>)}</div></section>

    <section className="landing-benefits"><div><p className="eyebrow">Más control, menos fricción</p><h2>Una base confiable para tu operación diaria</h2></div><ul>{["Menos errores manuales.", "Información centralizada.", "Inventario actualizado.", "Mejor control del equipo."].map((benefit) => <li key={benefit}><Check aria-hidden="true" />{benefit}</li>)}</ul></section>
    <section className="landing-cta"><Truck aria-hidden="true" /><h2>Empieza a organizar tu inventario hoy</h2><p>Convierte el control de tus existencias en una ventaja para tu negocio.</p><Link className="button button--primary" to="/register">Crear mi cuenta gratis <ArrowRight aria-hidden="true" /></Link></section>
    <footer className="landing-footer"><div><strong>Inventario</strong><p>Claridad para cada producto, movimiento y decisión.</p></div><div className="landing-footer__links"><Link to="/login">Iniciar sesión</Link><Link to="/register">Registrarse</Link></div><small>© {new Date().getFullYear()} Inventario. Todos los derechos reservados.</small></footer>
  </main>;
}
